#!/usr/bin/env node
/**
 * Reverse VK constants from big-endian to little-endian for NEAR
 *
 * RISC Zero outputs big-endian hex, but NEAR's alt_bn128 interprets
 * byte arrays as little-endian integers. This script reverses all
 * VK constants for use in the NEAR contract.
 */

const fs = require('fs');
const path = require('path');

// Read the VK JSON file
const vkPath = path.join(__dirname, 'risc0_vk.json');
const vk = JSON.parse(fs.readFileSync(vkPath, 'utf8'));

/**
 * Reverse a hex string (with or without 0x prefix)
 * Example: "0x1234" -> "0x3412"
 */
function reverseHex(hexStr) {
    const hex = hexStr.replace('0x', '');
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(hex.substr(i, 2));
    }
    return '0x' + bytes.reverse().join('');
}

console.log('// RISC Zero Universal Groth16 Verification Key');
console.log('// REVERSED for NEAR (little-endian interpretation)');
console.log('// Source: risc0_vk.json');
console.log('');

console.log('// Alpha G1');
console.log(`const ALPHA_G1_X: [u8; 32] = hex_literal::hex!("${reverseHex(vk.alpha_g1.x).replace('0x', '')}");`);
console.log(`const ALPHA_G1_Y: [u8; 32] = hex_literal::hex!("${reverseHex(vk.alpha_g1.y).replace('0x', '')}");`);
console.log('');

console.log('// Beta G2');
console.log(`const BETA_G2_X_C0: [u8; 32] = hex_literal::hex!("${reverseHex(vk.beta_g2.x_c0).replace('0x', '')}");`);
console.log(`const BETA_G2_X_C1: [u8; 32] = hex_literal::hex!("${reverseHex(vk.beta_g2.x_c1).replace('0x', '')}");`);
console.log(`const BETA_G2_Y_C0: [u8; 32] = hex_literal::hex!("${reverseHex(vk.beta_g2.y_c0).replace('0x', '')}");`);
console.log(`const BETA_G2_Y_C1: [u8; 32] = hex_literal::hex!("${reverseHex(vk.beta_g2.y_c1).replace('0x', '')}");`);
console.log('');

console.log('// Gamma G2');
console.log(`const GAMMA_G2_X_C0: [u8; 32] = hex_literal::hex!("${reverseHex(vk.gamma_g2.x_c0).replace('0x', '')}");`);
console.log(`const GAMMA_G2_X_C1: [u8; 32] = hex_literal::hex!("${reverseHex(vk.gamma_g2.x_c1).replace('0x', '')}");`);
console.log(`const GAMMA_G2_Y_C0: [u8; 32] = hex_literal::hex!("${reverseHex(vk.gamma_g2.y_c0).replace('0x', '')}");`);
console.log(`const GAMMA_G2_Y_C1: [u8; 32] = hex_literal::hex!("${reverseHex(vk.gamma_g2.y_c1).replace('0x', '')}");`);
console.log('');

console.log('// Delta G2');
console.log(`const DELTA_G2_X_C0: [u8; 32] = hex_literal::hex!("${reverseHex(vk.delta_g2.x_c0).replace('0x', '')}");`);
console.log(`const DELTA_G2_X_C1: [u8; 32] = hex_literal::hex!("${reverseHex(vk.delta_g2.x_c1).replace('0x', '')}");`);
console.log(`const DELTA_G2_Y_C0: [u8; 32] = hex_literal::hex!("${reverseHex(vk.delta_g2.y_c0).replace('0x', '')}");`);
console.log(`const DELTA_G2_Y_C1: [u8; 32] = hex_literal::hex!("${reverseHex(vk.delta_g2.y_c1).replace('0x', '')}");`);
console.log('');

console.log('// IC points');
vk.ic.forEach((point, i) => {
    console.log(`const IC${i}_X: [u8; 32] = hex_literal::hex!("${reverseHex(point.x).replace('0x', '')}");`);
    console.log(`const IC${i}_Y: [u8; 32] = hex_literal::hex!("${reverseHex(point.y).replace('0x', '')}");`);
});
