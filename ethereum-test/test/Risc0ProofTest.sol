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
        // Generated with RISC Zero standard format (selector + seal)
        // Converted from little-endian to big-endian (Ethereum) format

        // Proof points
        uint256[2] memory pA = [
            4205956239891275763179550923091803425569206881993847558700484230223554855775,
            4737664037599104344477206832195617691395478089579814409998509294653753378161
        ];

        uint256[2][2] memory pB = [
            [18576868749907786279866840327959841189119378573766518604202137041079828696145, 12676294232596903923500667536957638676913897372915375073517112897838325488483],
            [21250174145310914880269224842373044967660661852502143176445976197811679966742, 21031740357409154841621720536840922140765770095141799441087437049187643100766]
        ];

        uint256[2] memory pC = [
            3291710187043632461704495497190108086630325431551296511180521709325643338932,
            18456966481153775234283331458094684140264949351585683765458108553305845052702
        ];

        // Public signals: [control_a0, control_a1, claim_c0, claim_c1, bn254_control_id]
        uint256[5] memory pubSignals = [
            77871768296560099202705690303776149029879382836048999885484148801569176944640,  // control_a0
            84564920791787406372993986640497024019176200894182817735484938645612391301120,  // control_a1
            78670308812166955689443706489800909078868786393107732404265258693399937024000,    // claim_c0
            4007470874239240949602368460353308172030260796591944812695556521530444742656,    // claim_c1
            21395591279665946504714282773591115599295320330206335257059489269122207728641   // bn254_control_id
        ];

        bool result = verifier.verifyProof(pA, pB, pC, pubSignals);

        console.log("Verification result:", result);

        // This proof should verify with RISC Zero standard serialization
        assertTrue(result, "Proof should verify on Ethereum");
    }
}
