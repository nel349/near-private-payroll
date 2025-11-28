// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../lib/risc0-ethereum/contracts/src/groth16/Groth16Verifier.sol";

contract Risc0ProofTest is Test {
    Groth16Verifier public verifier;

    function setUp() public {
        verifier = new Groth16Verifier();
    }

    function testVerifyRisc0Proof() public view {
        // RISC Zero Groth16 proof from scripts/test_proofs/income_threshold.json
        // Converted from little-endian (NEAR) to big-endian (Ethereum) format

        // Proof points
        uint256[2] memory pA = [
            1769963078552844865441750969289177978780491245530762687220615865467335455047,
            21044090808214919133459198525528647912384739873679542408265553762860990191530
        ];

        uint256[2][2] memory pB = [
            [18007688810453970697553141308033783522032998090571256706465514238812514565576, 12259456154193924985042007226163163974775593556019996292405992425338630007483],
            [15335272950825225291980766881782205537328219220154438536805187159413798199708, 15403509643148776424040778047124504646557701390653613071720823000551752864699]
        ];

        uint256[2] memory pC = [
            18692250982126884288483926523734994960216902947472609859770849466645206456002,
            3276150503971145637677064835839076202765234471842687417361185441851976648128
        ];

        // Public signals: [control_a0, control_a1, claim_c0, claim_c1, bn254_control_id]
        uint256[5] memory pubSignals = [
            77871768296560099202705690303776149029879382836048999885484148801569176944640,  // control_a0
            84564920791787406372993986640497024019176200894182817735484938645612391301120,  // control_a1
            5960163024144976301359998777747605744753662836226664223036938119109664571392,    // claim_c0
            102658154304420301488410429331680662537488944875681766778158059860928313163776,  // claim_c1
            21395591279665946504714282773591115599295320330206335257059489269122207728641   // bn254_control_id
        ];

        bool result = verifier.verifyProof(pA, pB, pC, pubSignals);

        console.log("Verification result:", result);

        // This proof should verify if RISC Zero's Groth16 is compatible with Ethereum
        assertTrue(result, "Proof should verify on Ethereum");
    }
}
