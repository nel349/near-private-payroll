// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {RiscZeroGroth16Verifier} from "../lib/risc0-ethereum/contracts/src/groth16/RiscZeroGroth16Verifier.sol";
import {ControlID} from "../lib/risc0-ethereum/contracts/src/groth16/ControlID.sol";
import {Receipt as Risc0Receipt} from "../lib/risc0-ethereum/contracts/src/IRiscZeroVerifier.sol";

contract Risc0FullVerificationTest is Test {
    RiscZeroGroth16Verifier public verifier;

    function setUp() public {
        // Deploy verifier with official v3.0.x control IDs
        verifier = new RiscZeroGroth16Verifier(
            ControlID.CONTROL_ROOT,
            ControlID.BN254_CONTROL_ID
        );
    }

    function testVerifyIncomeProof() public view {
        // RISC Zero Groth16 proof from scripts/test_proofs/income_threshold.json
        // Generated with RISC Zero v3.0.4 using ProverOpts::groth16() (local Docker prover)

        // Receipt format: [selector (4)] + [seal (256)]
        bytes memory seal = hex"73c457ba2a1b73986f59949346c3c3b2d5c4c59c3d739f5e855e87704f2883685f6a09e802de8f0e36425ea3fb231f2c6bf290341b894cf1fa160275972e97ca814b24cd2de16632a8af69b0c269a3d7f2ce9c66352ad915405694f70918f7b04611684506bedd04b55127fd4a9093cbce4c0d277abb598629d8e956ee99ced1dea7731430528912e643ec414467dd2f20f18d331ba47d1f679d25c7ff45c1f544165d0b213fd3242d81e7c0bfa6a0a164c44f629e62e489b46929da8c8ad4eba7a501eb287fc2f842acc2159ce6dae2801f909dfe600f87d04044825d2c75e8cf6643b41ff0722ed875591eb63666075eee9de9b43218c946321e00b7206b42e5f77dbe";

        bytes32 claimDigest = 0x7eee38b9a5a25fb54681c6391dd1edad8c818f7c547e17cd3f7a7f27ec25dc08;

        // Verify the proof
        Risc0Receipt memory receipt = Risc0Receipt({
            seal: seal,
            claimDigest: claimDigest
        });

        // This should succeed if:
        // 1. Serialization format is correct (selector + seal)
        // 2. Groth16 proof was generated with correct recursion circuit
        // 3. Control IDs match between prover and verifier
        verifier.verifyIntegrity(receipt);

        console.log("Verification succeeded!");
    }
}
