/**
 * RISC Zero Universal Groth16 Verification Key Extractor
 *
 * This program converts RISC Zero's hardcoded VK constants (from risc0-groth16/src/verifier.rs)
 * into hex format suitable for the NEAR contract.
 *
 * Run with: cargo run --manifest-path scripts/vk_extractor/Cargo.toml
 */

use num_bigint::BigInt;
use num_traits::Num;

// Constants from risc0-groth16 v3.0.3 src/verifier.rs
// These are the RISC Zero universal verification key constants
const ALPHA_X: &str = "20491192805390485299153009773594534940189261866228447918068658471970481763042";
const ALPHA_Y: &str = "9383485363053290200918347156157836566562967994039712273449902621266178545958";
const BETA_X1: &str = "4252822878758300859123897981450591353533073413197771768651442665752259397132";
const BETA_X2: &str = "6375614351688725206403948262868962793625744043794305715222011528459656738731";
const BETA_Y1: &str = "21847035105528745403288232691147584728191162732299865338377159692350059136679";
const BETA_Y2: &str = "10505242626370262277552901082094356697409835680220590971873171140371331206856";
const GAMMA_X1: &str = "11559732032986387107991004021392285783925812861821192530917403151452391805634";
const GAMMA_X2: &str = "10857046999023057135944570762232829481370756359578518086990519993285655852781";
const GAMMA_Y1: &str = "4082367875863433681332203403145435568316851327593401208105741076214120093531";
const GAMMA_Y2: &str = "8495653923123431417604973247489272438418190587263600148770280649306958101930";
const DELTA_X1: &str = "1668323501672964604911431804142266013250380587483576094566949227275849579036";
const DELTA_X2: &str = "12043754404802191763554326994664886008979042643626290185762540825416902247219";
const DELTA_Y1: &str = "7710631539206257456743780535472368339139328733484942210876916214502466455394";
const DELTA_Y2: &str = "13740680757317479711909903993315946540841369848973133181051452051592786724563";

const IC0_X: &str = "8446592859352799428420270221449902464741693648963397251242447530457567083492";
const IC0_Y: &str = "1064796367193003797175961162477173481551615790032213185848276823815288302804";
const IC1_X: &str = "3179835575189816632597428042194253779818690147323192973511715175294048485951";
const IC1_Y: &str = "20895841676865356752879376687052266198216014795822152491318012491767775979074";
const IC2_X: &str = "5332723250224941161709478398807683311971555792614491788690328996478511465287";
const IC2_Y: &str = "21199491073419440416471372042641226693637837098357067793586556692319371762571";
const IC3_X: &str = "12457994489566736295787256452575216703923664299075106359829199968023158780583";
const IC3_Y: &str = "19706766271952591897761291684837117091856807401404423804318744964752784280790";
const IC4_X: &str = "19617808913178163826953378459323299110911217259216006187355745713323154132237";
const IC4_Y: &str = "21663537384585072695701846972542344484111393047775983928357046779215877070466";
const IC5_X: &str = "6834578911681792552110317589222010969491336870276623105249474534788043166867";
const IC5_Y: &str = "15060583660288623605191393599883223885678013570733629274538391874953353488393";

fn decimal_to_hex_array(decimal_str: &str) -> String {
    let value = BigInt::from_str_radix(decimal_str, 10).expect("Invalid decimal number");
    let bytes = value.to_bytes_be().1;

    // Pad to 32 bytes
    let mut padded = vec![0u8; 32];
    let start = 32 - bytes.len().min(32);
    padded[start..].copy_from_slice(&bytes[bytes.len().saturating_sub(32)..]);

    format!("hex_literal::hex!(\"{}\")", hex::encode(&padded))
}

fn main() {
    println!("// RISC Zero Universal Groth16 Verification Key");
    println!("// Extracted from risc0-groth16 v3.0.3");
    println!("// Source: risc0-groth16/src/verifier.rs");
    println!("// This is the SAME key for ALL RISC Zero circuits\n");

    // Alpha G1
    println!("const ALPHA_G1_X: [u8; 32] = {};", decimal_to_hex_array(ALPHA_X));
    println!("const ALPHA_G1_Y: [u8; 32] = {};", decimal_to_hex_array(ALPHA_Y));
    println!();

    // Beta G2
    println!("const BETA_G2_X_C0: [u8; 32] = {};", decimal_to_hex_array(BETA_X1));
    println!("const BETA_G2_X_C1: [u8; 32] = {};", decimal_to_hex_array(BETA_X2));
    println!("const BETA_G2_Y_C0: [u8; 32] = {};", decimal_to_hex_array(BETA_Y1));
    println!("const BETA_G2_Y_C1: [u8; 32] = {};", decimal_to_hex_array(BETA_Y2));
    println!();

    // Gamma G2
    println!("const GAMMA_G2_X_C0: [u8; 32] = {};", decimal_to_hex_array(GAMMA_X1));
    println!("const GAMMA_G2_X_C1: [u8; 32] = {};", decimal_to_hex_array(GAMMA_X2));
    println!("const GAMMA_G2_Y_C0: [u8; 32] = {};", decimal_to_hex_array(GAMMA_Y1));
    println!("const GAMMA_G2_Y_C1: [u8; 32] = {};", decimal_to_hex_array(GAMMA_Y2));
    println!();

    // Delta G2
    println!("const DELTA_G2_X_C0: [u8; 32] = {};", decimal_to_hex_array(DELTA_X1));
    println!("const DELTA_G2_X_C1: [u8; 32] = {};", decimal_to_hex_array(DELTA_X2));
    println!("const DELTA_G2_Y_C0: [u8; 32] = {};", decimal_to_hex_array(DELTA_Y1));
    println!("const DELTA_G2_Y_C1: [u8; 32] = {};", decimal_to_hex_array(DELTA_Y2));
    println!();

    // IC points
    println!("// IC points (6 total = 5 public inputs + 1)");
    println!("const IC0_X: [u8; 32] = {};", decimal_to_hex_array(IC0_X));
    println!("const IC0_Y: [u8; 32] = {};", decimal_to_hex_array(IC0_Y));
    println!("const IC1_X: [u8; 32] = {};", decimal_to_hex_array(IC1_X));
    println!("const IC1_Y: [u8; 32] = {};", decimal_to_hex_array(IC1_Y));
    println!("const IC2_X: [u8; 32] = {};", decimal_to_hex_array(IC2_X));
    println!("const IC2_Y: [u8; 32] = {};", decimal_to_hex_array(IC2_Y));
    println!("const IC3_X: [u8; 32] = {};", decimal_to_hex_array(IC3_X));
    println!("const IC3_Y: [u8; 32] = {};", decimal_to_hex_array(IC3_Y));
    println!("const IC4_X: [u8; 32] = {};", decimal_to_hex_array(IC4_X));
    println!("const IC4_Y: [u8; 32] = {};", decimal_to_hex_array(IC4_Y));
    println!("const IC5_X: [u8; 32] = {};", decimal_to_hex_array(IC5_X));
    println!("const IC5_Y: [u8; 32] = {};", decimal_to_hex_array(IC5_Y));

    println!("\n// Total IC points: 6");
    println!("// Public inputs expected: 5");
    println!("// Format: [control_root_a0, control_root_a1, claim_c0, claim_c1, bn254_control_id]");
}
