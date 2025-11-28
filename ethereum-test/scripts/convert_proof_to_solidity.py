#!/usr/bin/env python3
"""
Convert RISC Zero test proof to Solidity format for Ethereum testing.
This will help us determine if the proof works on Ethereum's alt_bn128.
"""

import json
import sys

def bytes_to_uint256_be(data):
    """Convert 32-byte little-endian to big-endian uint256"""
    # Our data is stored little-endian, Ethereum expects big-endian
    reversed_bytes = bytes(reversed(data))
    return int.from_bytes(reversed_bytes, 'big')

def main():
    # Load our test proof
    with open('../scripts/test_proofs/income_threshold.json', 'r') as f:
        proof_data = json.load(f)

    receipt_array = proof_data['receipt']
    receipt_bytes = bytes(receipt_array)

    print("=== RISC Zero Proof → Ethereum Solidity Format ===\n")

    # Parse receipt structure (464 bytes total)
    # [image_id (32)] [claim_digest (32)] [seal (256)] [journal (144)]
    image_id = receipt_bytes[0:32]
    claim_digest = receipt_bytes[32:64]
    seal = receipt_bytes[64:320]
    journal = receipt_bytes[320:464]

    # Parse seal (256 bytes): [A (64)] [B (128)] [C (64)]
    # A: G1 point [x (32), y (32)]
    a_x_bytes = seal[0:32]
    a_y_bytes = seal[32:64]

    # B: G2 point [x_c0 (32), x_c1 (32), y_c0 (32), y_c1 (32)]
    # RISC Zero stores in Ethereum format: [[c1, c0], [c1, c0]]
    b_x_c0_bytes = seal[64:96]
    b_x_c1_bytes = seal[96:128]
    b_y_c0_bytes = seal[128:160]
    b_y_c1_bytes = seal[160:192]

    # C: G1 point [x (32), y (32)]
    c_x_bytes = seal[192:224]
    c_y_bytes = seal[224:256]

    # Convert to big-endian uint256 for Ethereum
    a_x = bytes_to_uint256_be(a_x_bytes)
    a_y = bytes_to_uint256_be(a_y_bytes)

    # For G2, Ethereum expects [[x_imag, x_real], [y_imag, y_real]]
    # But RISC Zero stores [[x_real, x_imag], [y_real, y_imag]]
    # So: c0=real (should go to index 1), c1=imag (should go to index 0)
    # Wait - let's check the actual format by looking at the contract...
    # From Groth16Verifier.sol lines 132-136, Ethereum expects:
    # mstore(add(_pPairing, 64), calldataload(pB))      // First element
    # mstore(add(_pPairing, 96), calldataload(add(pB, 32)))   // Second element
    # mstore(add(_pPairing, 128), calldataload(add(pB, 64)))  // Third element
    # mstore(add(_pPairing, 160), calldataload(add(pB, 96)))  // Fourth element

    # The calldata format for pB is [2][2], so:
    # pB[0][0], pB[0][1], pB[1][0], pB[1][1]

    # RISC Zero seal has: c0, c1, c0, c1 (in positions 64-96, 96-128, 128-160, 160-192)
    # We need to figure out if c0=real or c0=imaginary

    # From our investigation, RISC Zero uses Ethereum/Solidity format
    # So seal has: x.real, x.imag, y.real, y.imag
    # And Ethereum pB expects: [[x.?, x.?], [y.?, y.?]]

    # Let's just convert directly - the seal is already in Ethereum format!
    b_x_0 = bytes_to_uint256_be(b_x_c0_bytes)  # x first component
    b_x_1 = bytes_to_uint256_be(b_x_c1_bytes)  # x second component
    b_y_0 = bytes_to_uint256_be(b_y_c0_bytes)  # y first component
    b_y_1 = bytes_to_uint256_be(b_y_c1_bytes)  # y second component

    c_x = bytes_to_uint256_be(c_x_bytes)
    c_y = bytes_to_uint256_be(c_y_bytes)

    print("// Proof points (converted to Ethereum big-endian format)")
    print(f"uint256[2] memory pA = [{a_x}, {a_y}];")
    print()
    print(f"uint256[2][2] memory pB = [")
    print(f"    [{b_x_0}, {b_x_1}],")
    print(f"    [{b_y_0}, {b_y_1}]")
    print(f"];")
    print()
    print(f"uint256[2] memory pC = [{c_x}, {c_y}];")
    print()

    # Now compute public signals
    # From our NEAR contract, public signals are:
    # [control_a0, control_a1, claim_c0, claim_c1, bn254_control_id]

    # control_a0, control_a1 = split_digest(image_id)
    # claim_c0, claim_c1 = split_digest(claim_digest)
    # bn254_control_id = reversed BN254_CONTROL_ID

    # split_digest implementation (from lib.rs):
    # 1. Reverse the 32-byte digest
    # 2. Split into two 16-byte halves
    # 3. Return as 32-byte values (lower 128 bits, upper 128 bits)

    def split_digest(digest):
        """Split digest according to RISC Zero's splitDigest"""
        # Reverse byte order
        reversed_digest = bytes(reversed(digest))

        # Split into halves
        lower_128 = reversed_digest[16:32]  # Lower 128 bits (bytes 16-31)
        upper_128 = reversed_digest[0:16]   # Upper 128 bits (bytes 0-15)

        # Pad to 32 bytes and convert to uint256 (big-endian for Ethereum)
        a0 = int.from_bytes(lower_128 + b'\x00' * 16, 'big')
        a1 = int.from_bytes(upper_128 + b'\x00' * 16, 'big')

        return a0, a1

    control_a0, control_a1 = split_digest(image_id)
    claim_c0, claim_c1 = split_digest(claim_digest)

    # BN254_CONTROL_ID (from lib.rs CONTROL_ROOT)
    # This is the control root hash, reversed for little-endian
    BN254_CONTROL_ID_BE = bytes.fromhex("2f4d79bbb8a7d40e3810c50b21839bc61b2b9ae1b96b0b00b4452017966e4401")
    # For Ethereum, we need big-endian
    bn254_id = int.from_bytes(BN254_CONTROL_ID_BE, 'big')

    print("// Public signals")
    print(f"uint256[5] memory pubSignals = [")
    print(f"    {control_a0},  // control_a0")
    print(f"    {control_a1},  // control_a1")
    print(f"    {claim_c0},    // claim_c0")
    print(f"    {claim_c1},    // claim_c1")
    print(f"    {bn254_id}     // bn254_control_id")
    print(f"];")
    print()

    print("// Debug info:")
    print(f"// Image ID: {image_id.hex()}")
    print(f"// Claim digest: {claim_digest.hex()}")
    print(f"// A.x (LE hex): {a_x_bytes.hex()}")
    print(f"// A.y (LE hex): {a_y_bytes.hex()}")
    print(f"// B.x.c0 (LE hex): {b_x_c0_bytes.hex()}")
    print(f"// B.x.c1 (LE hex): {b_x_c1_bytes.hex()}")
    print(f"// C.x (LE hex): {c_x_bytes.hex()}")
    print(f"// C.y (LE hex): {c_y_bytes.hex()}")

if __name__ == '__main__':
    main()
