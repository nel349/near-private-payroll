// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {RiscZeroGroth16Verifier} from "../lib/risc0-ethereum/contracts/src/groth16/RiscZeroGroth16Verifier.sol";
import {Groth16Verifier} from "../lib/risc0-ethereum/contracts/src/groth16/Groth16Verifier.sol";
import {ControlID} from "../lib/risc0-ethereum/contracts/src/groth16/ControlID.sol";
import {Receipt as Risc0Receipt} from "../lib/risc0-ethereum/contracts/src/IRiscZeroVerifier.sol";

struct Seal {
    uint256[2] a;
    uint256[2][2] b;
    uint256[2] c;
}

contract DetailedDebugTest is Test, Groth16Verifier {
    RiscZeroGroth16Verifier public verifier;

    function setUp() public {
        verifier = new RiscZeroGroth16Verifier(
            ControlID.CONTROL_ROOT,
            ControlID.BN254_CONTROL_ID
        );
    }

    function reverseByteOrderUint256(uint256 input) internal pure returns (uint256 output) {
        for (uint256 i = 0; i < 32; i++) {
            output = (output << 8) | ((input >> (i * 8)) & 0xFF);
        }
    }

    function splitDigest(bytes32 digest) internal pure returns (bytes16, bytes16) {
        uint256 reversed = reverseByteOrderUint256(uint256(digest));
        return (bytes16(uint128(reversed)), bytes16(uint128(reversed >> 128)));
    }

    function testDetailedDebug() public view {
        bytes memory sealBytes = hex"73c457ba094c7ca38b96b905e2899a787856cd66da216254fc1221c6705d56156daec35f0a796c3de1ac14e229339a19d5cd91a71f3558ecba51cfeb150de7ec2e71c5712912229646d668486fbbbaa10e76d437cbaaaa935b7cf48107da88d55f3b4c511c06873d5acee103f4f4c746ee2ff3fef391f370d93f706748c7e880f4e0db6307470abcb87b001ed6d2cbdbdb049115632baf4987170eda7a9257746aaad4b428ce45d7f30375f30847ba7586b2041828d7e4bff553200b24cc8e46421eb51e";

        bytes32 claimDigest = 0x7eee38b9a5a25fb54681c6391dd1edad8c818f7c547e17cd3f7a7f27ec25dc08;

        // Step 1: Check selector
        bytes4 selector;
        assembly {
            selector := mload(add(sealBytes, 32))
        }
        console.log("Selector from proof:");
        console.logBytes4(selector);
        console.log("Expected selector:");
        console.logBytes4(verifier.SELECTOR());
        require(selector == verifier.SELECTOR(), "Selector mismatch");
        console.log("PASS: Selector check");

        // Step 2: Try to decode seal (skip first 4 bytes)
        bytes memory sealOnly = new bytes(sealBytes.length - 4);
        for (uint i = 0; i < sealOnly.length; i++) {
            sealOnly[i] = sealBytes[i + 4];
        }
        Seal memory decodedSeal = abi.decode(sealOnly, (Seal));
        console.log("PASS: Seal decoded");
        console.log("A.x:");
        console.logBytes32(bytes32(decodedSeal.a[0]));
        console.log("A.y:");
        console.logBytes32(bytes32(decodedSeal.a[1]));

        // Step 3: Split claim digest
        (bytes16 claim0, bytes16 claim1) = splitDigest(claimDigest);
        console.log("Claim digest split:");
        console.logBytes16(claim0);
        console.logBytes16(claim1);

        // Step 4: Build public signals
        (bytes16 root0, bytes16 root1) = splitDigest(ControlID.CONTROL_ROOT);
        uint256[5] memory publicSignals = [
            uint256(uint128(root0)),
            uint256(uint128(root1)),
            uint256(uint128(claim0)),
            uint256(uint128(claim1)),
            uint256(ControlID.BN254_CONTROL_ID)
        ];

        console.log("Public signal 0 (CONTROL_ROOT_0):");
        console.logUint(publicSignals[0]);
        console.log("Public signal 1 (CONTROL_ROOT_1):");
        console.logUint(publicSignals[1]);
        console.log("Public signal 2 (claim0):");
        console.logUint(publicSignals[2]);
        console.log("Public signal 3 (claim1):");
        console.logUint(publicSignals[3]);
        console.log("Public signal 4 (BN254_CONTROL_ID):");
        console.logUint(publicSignals[4]);

        // Step 5: Try pairing verification
        bool verified = this.verifyProof(
            decodedSeal.a,
            decodedSeal.b,
            decodedSeal.c,
            publicSignals
        );

        if (verified) {
            console.log("PASS: Proof verification succeeded");
        } else {
            console.log("FAIL: Proof verification failed");
        }

        require(verified, "Proof should verify");
    }
}
