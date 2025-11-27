// Tool to format RISC Zero Groth16 verification key for NEAR contract registration
// Run with: cargo test --test format_vk_for_near -- --nocapture

use num_bigint::BigUint;
use num_traits::Num;

/// RISC Zero Groth16 Verification Key Constants
/// Source: risc0-groth16-3.0.3/src/verifier.rs
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

/// Convert decimal string to 32-byte big-endian array
fn decimal_to_bytes(decimal_str: &str) -> [u8; 32] {
    let big_uint = BigUint::from_str_radix(decimal_str, 10)
        .expect("Failed to parse decimal string");

    let bytes = big_uint.to_bytes_be();

    // Pad to 32 bytes if needed
    let mut result = [0u8; 32];
    let start = 32 - bytes.len();
    result[start..].copy_from_slice(&bytes);

    result
}

/// Format bytes as hex string with 0x prefix
fn bytes_to_hex(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

/// Format a G1 point for JSON output
fn format_g1_point(name: &str, x: &[u8; 32], y: &[u8; 32]) {
    println!("  \"{}\": {{", name);
    println!("    \"x\": {},", bytes_to_hex(x));
    println!("    \"y\": {}", bytes_to_hex(y));
    println!("  }},");
}

/// Format a G2 point for JSON output
fn format_g2_point(name: &str, x_c0: &[u8; 32], x_c1: &[u8; 32], y_c0: &[u8; 32], y_c1: &[u8; 32]) {
    println!("  \"{}\": {{", name);
    println!("    \"x_c0\": {},", bytes_to_hex(x_c0));
    println!("    \"x_c1\": {},", bytes_to_hex(x_c1));
    println!("    \"y_c0\": {},", bytes_to_hex(y_c0));
    println!("    \"y_c1\": {}", bytes_to_hex(y_c1));
    println!("  }},");
}

#[test]
fn format_verification_key() {
    println!("\n=== RISC Zero Groth16 Verification Key for NEAR ===\n");

    // Convert all constants to bytes
    let alpha_x = decimal_to_bytes(ALPHA_X);
    let alpha_y = decimal_to_bytes(ALPHA_Y);

    let beta_x_c0 = decimal_to_bytes(BETA_X1);
    let beta_x_c1 = decimal_to_bytes(BETA_X2);
    let beta_y_c0 = decimal_to_bytes(BETA_Y1);
    let beta_y_c1 = decimal_to_bytes(BETA_Y2);

    let gamma_x_c0 = decimal_to_bytes(GAMMA_X1);
    let gamma_x_c1 = decimal_to_bytes(GAMMA_X2);
    let gamma_y_c0 = decimal_to_bytes(GAMMA_Y1);
    let gamma_y_c1 = decimal_to_bytes(GAMMA_Y2);

    let delta_x_c0 = decimal_to_bytes(DELTA_X1);
    let delta_x_c1 = decimal_to_bytes(DELTA_X2);
    let delta_y_c0 = decimal_to_bytes(DELTA_Y1);
    let delta_y_c1 = decimal_to_bytes(DELTA_Y2);

    let ic0_x = decimal_to_bytes(IC0_X);
    let ic0_y = decimal_to_bytes(IC0_Y);
    let ic1_x = decimal_to_bytes(IC1_X);
    let ic1_y = decimal_to_bytes(IC1_Y);
    let ic2_x = decimal_to_bytes(IC2_X);
    let ic2_y = decimal_to_bytes(IC2_Y);
    let ic3_x = decimal_to_bytes(IC3_X);
    let ic3_y = decimal_to_bytes(IC3_Y);
    let ic4_x = decimal_to_bytes(IC4_X);
    let ic4_y = decimal_to_bytes(IC4_Y);
    let ic5_x = decimal_to_bytes(IC5_X);
    let ic5_y = decimal_to_bytes(IC5_Y);

    println!("{{");

    // Alpha (G1)
    format_g1_point("alpha_g1", &alpha_x, &alpha_y);

    // Beta (G2)
    format_g2_point("beta_g2", &beta_x_c0, &beta_x_c1, &beta_y_c0, &beta_y_c1);

    // Gamma (G2)
    format_g2_point("gamma_g2", &gamma_x_c0, &gamma_x_c1, &gamma_y_c0, &gamma_y_c1);

    // Delta (G2)
    format_g2_point("delta_g2", &delta_x_c0, &delta_x_c1, &delta_y_c0, &delta_y_c1);

    // IC points (G1 array)
    println!("  \"ic\": [");

    // IC0
    println!("    {{");
    println!("      \"x\": {},", bytes_to_hex(&ic0_x));
    println!("      \"y\": {}", bytes_to_hex(&ic0_y));
    println!("    }},");

    // IC1
    println!("    {{");
    println!("      \"x\": {},", bytes_to_hex(&ic1_x));
    println!("      \"y\": {}", bytes_to_hex(&ic1_y));
    println!("    }},");

    // IC2
    println!("    {{");
    println!("      \"x\": {},", bytes_to_hex(&ic2_x));
    println!("      \"y\": {}", bytes_to_hex(&ic2_y));
    println!("    }},");

    // IC3
    println!("    {{");
    println!("      \"x\": {},", bytes_to_hex(&ic3_x));
    println!("      \"y\": {}", bytes_to_hex(&ic3_y));
    println!("    }},");

    // IC4
    println!("    {{");
    println!("      \"x\": {},", bytes_to_hex(&ic4_x));
    println!("      \"y\": {}", bytes_to_hex(&ic4_y));
    println!("    }},");

    // IC5 (last, no comma)
    println!("    {{");
    println!("      \"x\": {},", bytes_to_hex(&ic5_x));
    println!("      \"y\": {}", bytes_to_hex(&ic5_y));
    println!("    }}");

    println!("  ]");
    println!("}}");

    println!("\n=== Registration Instructions ===");
    println!("Save the above JSON to a file (e.g., risc0_vk.json)");
    println!("\nRegister for ALL proof types using near-cli:");
    println!("\nfor proof_type in income_threshold income_range credit_score payment balance; do");
    println!("  near call <contract-id> register_verification_key \\");
    println!("    '{{\"proof_type\":\"'$proof_type'\",\"vk\":'$(cat risc0_vk.json)'}}' \\");
    println!("    --accountId <your-account>.testnet --gas 300000000000000");
    println!("done");

    println!("\n=== Notes ===");
    println!("• RISC Zero uses ONE universal VK for ALL circuits");
    println!("• The VK verifies the recursion circuit, not individual application circuits");
    println!("• Application circuit verification happens in the STARK layer");
    println!("• The Groth16 layer only proves: 'this STARK proof is valid'");
    println!("• This is why we register the SAME key for all proof types");
}
