// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {RiscZeroGroth16Verifier} from "../lib/risc0-ethereum/contracts/src/groth16/RiscZeroGroth16Verifier.sol";
import {ControlID} from "../lib/risc0-ethereum/contracts/src/groth16/ControlID.sol";

contract CheckSelector is Test {
    function testCheckSelector() public {
        RiscZeroGroth16Verifier verifier = new RiscZeroGroth16Verifier(
            ControlID.CONTROL_ROOT,
            ControlID.BN254_CONTROL_ID
        );
        
        bytes4 expectedSelector = verifier.SELECTOR();
        bytes4 ourSelector = 0x73c457ba;
        
        console.log("Expected selector:");
        console.logBytes4(expectedSelector);
        console.log("Our proof selector:");
        console.logBytes4(ourSelector);
        
        assertEq(ourSelector, expectedSelector, "Selector mismatch");
    }
}
