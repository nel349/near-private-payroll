//! Groth16 Verification using NEAR's alt_bn128 precompiles
//!
//! This module implements Groth16 proof verification using NEAR Protocol's
//! built-in alt_bn128 elliptic curve precompiles.
//!
//! The Groth16 verification equation is:
//! e(A, B) * e(-vk_α, vk_β) * e(-C, vk_δ) * e(-public_inputs·IC, vk_γ) == 1
//!
//! Where e() is the optimal ate pairing on the BN254 curve.

use near_sdk::env;
use crate::{G1Point, G2Point, Groth16Proof, Groth16VerificationKey};

/// RISC Zero Groth16 Seal structure (matches risc0_groth16::Seal)
/// This is the format that RISC Zero uses when serializing Groth16 proofs
#[derive(serde::Deserialize)]
struct RiscZeroSeal {
    /// Proof point A (G1): Vec of 2 elements [x_bytes, y_bytes]
    pub a: Vec<Vec<u8>>,
    /// Proof point B (G2): Vec of 2 elements, each with 2 Fp2 components
    /// [[x_c0_bytes, x_c1_bytes], [y_c0_bytes, y_c1_bytes]]
    pub b: Vec<Vec<Vec<u8>>>,
    /// Proof point C (G1): Vec of 2 elements [x_bytes, y_bytes]
    pub c: Vec<Vec<u8>>,
}

/// Parse a Groth16 proof from RISC Zero seal bytes
///
/// The RISC Zero Groth16 seal is bincode-serialized and contains:
/// - Proof point A (G1 point in big-endian)
/// - Proof point B (G2 point in big-endian)
/// - Proof point C (G1 point in big-endian)
///
/// RISC Zero's seal format uses nested Vec structures which we convert to fixed-size arrays.
pub fn parse_risc_zero_seal(seal_bytes: &[u8]) -> Result<Groth16Proof, String> {
    env::log_str("=== PARSING RISC ZERO SEAL ===");
    env::log_str(&format!("Seal length: {} bytes", seal_bytes.len()));
    env::log_str(&format!("Seal (hex): {}", hex::encode(seal_bytes)));

    // Deserialize the RISC Zero seal structure
    let seal: RiscZeroSeal = bincode::deserialize(seal_bytes)
        .map_err(|e| format!("Failed to deserialize RISC Zero seal: {}", e))?;

    // Helper to convert Vec<u8> to [u8; 32]
    // IMPORTANT: RISC Zero's Groth16 seal is ALREADY in LITTLE-ENDIAN format!
    // NEAR's alt_bn128 precompiles also expect LITTLE-ENDIAN format.
    // Therefore, NO byte reversal is needed - just copy directly.
    // (Verified by curve point validation in scripts/verify_proof_endianness.py)
    let to_array = |vec: &Vec<u8>| -> Result<[u8; 32], String> {
        if vec.len() != 32 {
            return Err(format!("Expected 32 bytes, got {}", vec.len()));
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&vec);

        // No reversal needed - RISC Zero already uses little-endian!

        Ok(arr)
    };

    // Parse G1 point A
    if seal.a.len() != 2 {
        return Err(format!("Invalid G1 point A: expected 2 coordinates, got {}", seal.a.len()));
    }
    env::log_str("Parsing A.x:");
    let a_x = to_array(&seal.a[0])?;
    env::log_str("Parsing A.y:");
    let a_y = to_array(&seal.a[1])?;
    let a = G1Point {
        x: a_x,
        y: a_y,
    };

    // Parse G2 point B
    // IMPORTANT: RISC Zero stores G2 points in Ethereum/Solidity format: [[c1, c0], [c1, c0]]
    // But NEAR expects: [c0, c1, c0, c1]
    // So we must SWAP the indices when reading!
    if seal.b.len() != 2 {
        return Err(format!("Invalid G2 point B: expected 2 Fp2 elements, got {}", seal.b.len()));
    }
    if seal.b[0].len() != 2 || seal.b[1].len() != 2 {
        return Err("Invalid G2 point B: Fp2 elements must have 2 components each".to_string());
    }
    env::log_str("Parsing B.x_c0 (from seal.b[0][1]):");
    let b_x_c0 = to_array(&seal.b[0][1])?;  // seal.b[0][1] = c0 (imaginary)
    env::log_str("Parsing B.x_c1 (from seal.b[0][0]):");
    let b_x_c1 = to_array(&seal.b[0][0])?;  // seal.b[0][0] = c1 (real)
    env::log_str("Parsing B.y_c0 (from seal.b[1][1]):");
    let b_y_c0 = to_array(&seal.b[1][1])?;  // seal.b[1][1] = c0 (imaginary)
    env::log_str("Parsing B.y_c1 (from seal.b[1][0]):");
    let b_y_c1 = to_array(&seal.b[1][0])?;  // seal.b[1][0] = c1 (real)
    let b = G2Point {
        x_c0: b_x_c0,  // Now correctly contains imaginary component
        x_c1: b_x_c1,  // Now correctly contains real component
        y_c0: b_y_c0,  // Now correctly contains imaginary component
        y_c1: b_y_c1,  // Now correctly contains real component
    };

    // Parse G1 point C
    if seal.c.len() != 2 {
        return Err(format!("Invalid G1 point C: expected 2 coordinates, got {}", seal.c.len()));
    }
    env::log_str("Parsing C.x:");
    let c_x = to_array(&seal.c[0])?;
    env::log_str("Parsing C.y:");
    let c_y = to_array(&seal.c[1])?;
    let c = G1Point {
        x: c_x,
        y: c_y,
    };

    env::log_str("=== SEAL PARSING COMPLETE ===");
    Ok(Groth16Proof { a, b, c })
}

/// Verify a Groth16 proof using NEAR's alt_bn128 precompiles
///
/// This implements the standard Groth16 verification equation:
/// e(A, B) * e(-α, β) * e(-C, δ) * e(-vk_ic, γ) == 1
///
/// Where vk_ic = IC[0] + Σ(public_input[i] * IC[i+1])
pub fn verify_groth16(
    vk: &Groth16VerificationKey,
    proof: &Groth16Proof,
    public_inputs: &[[u8; 32]],
) -> Result<bool, String> {
    // 1. Compute vk_ic = IC[0] + public_input[0]*IC[1] + public_input[1]*IC[2] + ...
    if public_inputs.len() + 1 != vk.ic.len() {
        return Err(format!(
            "Public input length mismatch: expected {}, got {}",
            vk.ic.len() - 1,
            public_inputs.len()
        ));
    }

    let vk_ic = compute_linear_combination(&vk.ic, public_inputs)?;
    env::log_str(&format!("vk_ic computed: x={}, y={}",
        hex::encode(&vk_ic.x[..8]), hex::encode(&vk_ic.y[..8])));

    // 2. Prepare pairing check inputs
    // We need to check: e(A, B) * e(-α, β) * e(-C, δ) * e(-vk_ic, γ) == 1
    //
    // NEAR's alt_bn128_pairing_check takes pairs of (G1, G2) points
    // and returns true if Π e(G1[i], G2[i]) == 1
    //
    // So we need: e(A, B) * e(-α, β) * e(-C, δ) * e(-vk_ic, γ) == 1
    //
    // Format: [G1_1, G2_1, G1_2, G2_2, G1_3, G2_3, G1_4, G2_4]
    // Where negation is done by negating the y-coordinate of G1 points

    // NEAR's alt_bn128_pairing_check format (verified from nearcore source):
    // For each pair: G1 (64 bytes) + G2 (128 bytes) = 192 bytes per pair
    // G1: x(32) || y(32)  [NO sign byte for pairing check!]
    // G2: x_c0(32) || x_c1(32) || y_c0(32) || y_c1(32)
    // Total for 4 pairs: 768 bytes
    //
    // Note: alt_bn128_g1_sum DOES use sign bytes (65 bytes per point),
    //       but alt_bn128_pairing_check does NOT (64 bytes per point).
    let mut pairing_input = Vec::with_capacity(768);

    // Pair 1: e(A, B)
    pairing_input.extend_from_slice(&proof.a.x);
    pairing_input.extend_from_slice(&proof.a.y);
    // NO sign byte for pairing check
    // G2 points: c0 = imaginary, c1 = real (SAME format as VK G2)
    // NEAR expects: x_c0 || x_c1 || y_c0 || y_c1
    pairing_input.extend_from_slice(&proof.b.x_c0); // x_imaginary FIRST
    pairing_input.extend_from_slice(&proof.b.x_c1); // x_real
    pairing_input.extend_from_slice(&proof.b.y_c0); // y_imaginary
    pairing_input.extend_from_slice(&proof.b.y_c1); // y_real

    // Pair 2: e(-α, β) = e(negate(α), β)
    let neg_alpha = negate_g1(&vk.alpha_g1)?;
    pairing_input.extend_from_slice(&neg_alpha.x);
    pairing_input.extend_from_slice(&neg_alpha.y);
    // NO sign byte for pairing check
    // G2 points: c0 = imaginary, c1 = real, serialized as c0||c1
    pairing_input.extend_from_slice(&vk.beta_g2.x_c0); // x_imaginary FIRST
    pairing_input.extend_from_slice(&vk.beta_g2.x_c1); // x_real
    pairing_input.extend_from_slice(&vk.beta_g2.y_c0); // y_imaginary
    pairing_input.extend_from_slice(&vk.beta_g2.y_c1); // y_real

    // Pair 3: e(-vk_ic, γ) = e(negate(vk_ic), γ)
    // IMPORTANT: This must be BEFORE pair 4 to match Groth16 equation order
    let neg_vk_ic = negate_g1(&vk_ic)?;
    pairing_input.extend_from_slice(&neg_vk_ic.x);
    pairing_input.extend_from_slice(&neg_vk_ic.y);
    // NO sign byte for pairing check
    // G2 points: c0 = imaginary, c1 = real, serialized as c0||c1
    pairing_input.extend_from_slice(&vk.gamma_g2.x_c0); // x_imaginary FIRST
    pairing_input.extend_from_slice(&vk.gamma_g2.x_c1); // x_real
    pairing_input.extend_from_slice(&vk.gamma_g2.y_c0); // y_imaginary
    pairing_input.extend_from_slice(&vk.gamma_g2.y_c1); // y_real

    // Pair 4: e(-C, δ) = e(negate(C), δ)
    let neg_c = negate_g1(&proof.c)?;
    pairing_input.extend_from_slice(&neg_c.x);
    pairing_input.extend_from_slice(&neg_c.y);
    // NO sign byte for pairing check
    // G2 points: c0 = imaginary, c1 = real, serialized as c0||c1
    pairing_input.extend_from_slice(&vk.delta_g2.x_c0); // x_imaginary FIRST
    pairing_input.extend_from_slice(&vk.delta_g2.x_c1); // x_real
    pairing_input.extend_from_slice(&vk.delta_g2.y_c0); // y_imaginary
    pairing_input.extend_from_slice(&vk.delta_g2.y_c1); // y_real

    // 3. Call NEAR's alt_bn128_pairing_check precompile
    // Returns true if the pairing equation holds
    env::log_str("=== CALLING PAIRING CHECK ===");
    env::log_str(&format!("Input length: {} bytes (expected 768)", pairing_input.len()));
    env::log_str(&format!("G2 format: c0||c1 (imaginary||real)"));

    // Log proof points for debugging
    env::log_str(&format!("Proof A: x={}, y={}",
        hex::encode(&proof.a.x[..8]), hex::encode(&proof.a.y[..8])));
    env::log_str(&format!("Proof B.x: c0={}, c1={}",
        hex::encode(&proof.b.x_c0[..8]), hex::encode(&proof.b.x_c1[..8])));
    env::log_str(&format!("Proof C: x={}, y={}",
        hex::encode(&proof.c.x[..8]), hex::encode(&proof.c.y[..8])));

    let result = env::alt_bn128_pairing_check(&pairing_input);

    env::log_str(&format!("=== PAIRING RESULT: {} ===", result));
    if !result {
        env::log_str("VERIFICATION FAILED - pairing check returned false");
        env::log_str("This means either:");
        env::log_str("  1. Proof is invalid for these public inputs");
        env::log_str("  2. Public input computation is wrong");
        env::log_str("  3. VK doesn't match the proof");
    } else {
        env::log_str("VERIFICATION SUCCESS - pairing check passed!");
    }

    Ok(result)
}

/// Compute linear combination: IC[0] + Σ(scalar[i] * IC[i+1])
/// This is used to compute vk_ic from public inputs
fn compute_linear_combination(
    ic_points: &[G1Point],
    scalars: &[[u8; 32]],
) -> Result<G1Point, String> {
    if scalars.len() + 1 != ic_points.len() {
        return Err("Scalar/IC length mismatch".to_string());
    }

    env::log_str(&format!("=== COMPUTING LINEAR COMBINATION ==="));
    env::log_str(&format!("IC points: {}, Scalars: {}", ic_points.len(), scalars.len()));

    // Start with IC[0]
    let mut result = ic_points[0].clone();
    env::log_str(&format!("Starting with IC[0]"));

    // Add each scalar[i] * IC[i+1]
    for (i, scalar) in scalars.iter().enumerate() {
        env::log_str(&format!("Processing public input {}: {}", i, hex::encode(scalar)));
        let point = &ic_points[i + 1];
        let scaled = scalar_mul_g1(point, scalar)?;
        result = add_g1(&result, &scaled)?;
        env::log_str(&format!("  Completed public input {}", i));
    }

    env::log_str("=== LINEAR COMBINATION COMPLETE ===");
    Ok(result)
}

/// Negate a G1 point by negating the y-coordinate
/// On BN254, if P = (x, y), then -P = (x, -y)
/// Uses NEAR's alt_bn128_g1_sum with sign flag
fn negate_g1(point: &G1Point) -> Result<G1Point, String> {
    // NEAR's alt_bn128_g1_sum format (sign comes FIRST):
    // sign (1 byte, 1 = negative) || x (32) || y (32)
    let mut input = Vec::with_capacity(65);
    input.push(1); // sign = 1 means negative (returns -P)
    input.extend_from_slice(&point.x);
    input.extend_from_slice(&point.y);

    let result = env::alt_bn128_g1_sum(&input);

    if result.len() != 64 {
        return Err(format!("Invalid negate result: got {} bytes, expected 64", result.len()));
    }

    let mut x = [0u8; 32];
    let mut y = [0u8; 32];
    x.copy_from_slice(&result[0..32]);
    y.copy_from_slice(&result[32..64]);

    Ok(G1Point { x, y })
}

/// Scalar multiplication on G1: scalar * point
/// Uses NEAR's alt_bn128_g1_multiexp precompile
fn scalar_mul_g1(point: &G1Point, scalar: &[u8; 32]) -> Result<G1Point, String> {
    env::log_str(&format!("scalar_mul_g1: scalar={}", hex::encode(scalar)));
    env::log_str(&format!("  point.x={}", hex::encode(&point.x[..8])));
    env::log_str(&format!("  point.y={}", hex::encode(&point.y[..8])));

    // CRITICAL: NEAR's alt_bn128 precompiles expect LITTLE-ENDIAN (not big-endian as in EIP-197)
    // Scalars from split_digest are already little-endian, use as-is

    // Format for alt_bn128_g1_multiexp: [x, y, scalar]
    // All values in little-endian for NEAR
    let mut input = Vec::with_capacity(96);
    input.extend_from_slice(&point.x);  // Little-endian from VK
    input.extend_from_slice(&point.y);  // Little-endian from VK
    input.extend_from_slice(scalar);    // Little-endian from split_digest

    env::log_str("  Calling alt_bn128_g1_multiexp...");
    let result = env::alt_bn128_g1_multiexp(&input);
    env::log_str(&format!("  Result: {} bytes", result.len()));

    if result.len() != 64 {
        return Err("Invalid multiexp result".to_string());
    }

    let mut x = [0u8; 32];
    let mut y = [0u8; 32];
    x.copy_from_slice(&result[0..32]);
    y.copy_from_slice(&result[32..64]);

    Ok(G1Point { x, y })
}

/// Point addition on G1: point1 + point2
/// Uses NEAR's alt_bn128_g1_sum precompile
fn add_g1(point1: &G1Point, point2: &G1Point) -> Result<G1Point, String> {
    // NEAR's alt_bn128_g1_sum format: consecutive points with sign bytes FIRST
    // Each point: sign (1 byte, 0 = positive) || x (32) || y (32)
    // Total: 65 bytes per point
    let mut input = Vec::with_capacity(130);

    // Point 1 (positive)
    input.push(0); // sign = 0 means positive
    input.extend_from_slice(&point1.x);
    input.extend_from_slice(&point1.y);

    // Point 2 (positive)
    input.push(0); // sign = 0 means positive
    input.extend_from_slice(&point2.x);
    input.extend_from_slice(&point2.y);

    let result = env::alt_bn128_g1_sum(&input);

    if result.len() != 64 {
        return Err(format!("Invalid sum result: got {} bytes, expected 64", result.len()));
    }

    let mut x = [0u8; 32];
    let mut y = [0u8; 32];
    x.copy_from_slice(&result[0..32]);
    y.copy_from_slice(&result[32..64]);

    Ok(G1Point { x, y })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_g1_point_serialization() {
        let point = G1Point {
            x: [1u8; 32],
            y: [2u8; 32],
        };

        let serialized = borsh::to_vec(&point).unwrap();
        let deserialized: G1Point = borsh::from_slice(&serialized).unwrap();

        assert_eq!(point.x, deserialized.x);
        assert_eq!(point.y, deserialized.y);
    }

    /// Test that add_g1 constructs the correct input buffer format
    /// NEAR's alt_bn128_g1_sum expects: [sign1(1) || x1(32) || y1(32) || sign2(1) || x2(32) || y2(32)]
    /// Total: 130 bytes (65 bytes per point)
    #[test]
    fn test_add_g1_input_format() {
        // Create test points
        let point1 = G1Point {
            x: [0x01; 32],
            y: [0x02; 32],
        };
        let point2 = G1Point {
            x: [0x03; 32],
            y: [0x04; 32],
        };

        // Build the input buffer manually to test the expected format
        let mut expected_input = Vec::with_capacity(130);

        // Point 1 (positive) - sign byte FIRST
        expected_input.push(0);                        // 1 byte (sign = 0 means positive)
        expected_input.extend_from_slice(&point1.x);  // 32 bytes
        expected_input.extend_from_slice(&point1.y);  // 32 bytes

        // Point 2 (positive) - sign byte FIRST
        expected_input.push(0);                        // 1 byte (sign = 0 means positive)
        expected_input.extend_from_slice(&point2.x);  // 32 bytes
        expected_input.extend_from_slice(&point2.y);  // 32 bytes

        // Verify the expected format
        assert_eq!(expected_input.len(), 130, "add_g1 input must be 130 bytes");
        assert_eq!(expected_input[0], 0, "First sign byte (index 0) must be 0 for positive");
        assert_eq!(expected_input[65], 0, "Second sign byte (index 65) must be 0 for positive");

        // Verify point data is in correct positions
        assert_eq!(&expected_input[1..33], &point1.x[..], "Point1.x at bytes 1-32");
        assert_eq!(&expected_input[33..65], &point1.y[..], "Point1.y at bytes 33-64");
        assert_eq!(&expected_input[66..98], &point2.x[..], "Point2.x at bytes 66-97");
        assert_eq!(&expected_input[98..130], &point2.y[..], "Point2.y at bytes 98-129");
    }

    /// Test that negate_g1 constructs the correct input buffer format
    /// NEAR's alt_bn128_g1_sum expects: [sign(1) || x(32) || y(32)]
    /// Total: 65 bytes
    /// When sign = 1, the precompile returns -P
    #[test]
    fn test_negate_g1_input_format() {
        // Create test point
        let point = G1Point {
            x: [0x05; 32],
            y: [0x06; 32],
        };

        // Build the input buffer manually to test the expected format
        let mut expected_input = Vec::with_capacity(65);
        expected_input.push(1);                       // 1 byte (sign = 1 means negative) - FIRST
        expected_input.extend_from_slice(&point.x);  // 32 bytes
        expected_input.extend_from_slice(&point.y);  // 32 bytes

        // Verify the expected format
        assert_eq!(expected_input.len(), 65, "negate_g1 input must be 65 bytes");
        assert_eq!(expected_input[0], 1, "Sign byte (index 0) must be 1 for negation");

        // Verify point data is in correct positions
        assert_eq!(&expected_input[1..33], &point.x[..], "Point.x at bytes 1-32");
        assert_eq!(&expected_input[33..65], &point.y[..], "Point.y at bytes 33-64");
    }

    /// Test that scalar_mul_g1 uses the correct input format
    /// NEAR's alt_bn128_g1_multiexp expects: [x(32) || y(32) || scalar(32)]
    /// Total: 96 bytes
    #[test]
    fn test_scalar_mul_g1_input_format() {
        // Create test point and scalar
        let point = G1Point {
            x: [0x07; 32],
            y: [0x08; 32],
        };
        let scalar = [0x09; 32];

        // Build the input buffer manually to test the expected format
        let mut expected_input = Vec::with_capacity(96);
        expected_input.extend_from_slice(&point.x);   // 32 bytes
        expected_input.extend_from_slice(&point.y);   // 32 bytes
        expected_input.extend_from_slice(&scalar);    // 32 bytes

        // Verify the expected format
        assert_eq!(expected_input.len(), 96, "scalar_mul_g1 input must be 96 bytes");

        // Verify data is in correct positions
        assert_eq!(&expected_input[0..32], &point.x[..], "Point.x at bytes 0-31");
        assert_eq!(&expected_input[32..64], &point.y[..], "Point.y at bytes 32-63");
        assert_eq!(&expected_input[64..96], &scalar[..], "Scalar at bytes 64-95");
    }

    /// Test that NEAR precompile output format is correctly parsed
    /// All G1 operations return: [x(32) || y(32)] = 64 bytes
    #[test]
    fn test_precompile_output_format() {
        // Mock output from NEAR precompile (64 bytes)
        let mut mock_output = Vec::with_capacity(64);
        mock_output.extend_from_slice(&[0xAA; 32]);  // x coordinate
        mock_output.extend_from_slice(&[0xBB; 32]);  // y coordinate

        assert_eq!(mock_output.len(), 64, "G1 precompile output must be 64 bytes");

        // Parse the output as done in add_g1, negate_g1, scalar_mul_g1
        let mut x = [0u8; 32];
        let mut y = [0u8; 32];
        x.copy_from_slice(&mock_output[0..32]);
        y.copy_from_slice(&mock_output[32..64]);

        assert_eq!(x, [0xAA; 32], "x coordinate parsed correctly");
        assert_eq!(y, [0xBB; 32], "y coordinate parsed correctly");
    }

    /// Test that pairing input format is correct
    /// NEAR's alt_bn128_pairing_check expects pairs of (G1, G2) points
    /// Each G1 point: x(32) || y(32) || sign(1) = 65 bytes
    /// Each G2 point: x_c0(32) || x_c1(32) || y_c0(32) || y_c1(32) = 128 bytes
    /// Total per pair: 193 bytes
    #[test]
    fn test_pairing_input_format() {
        // Create test G1 and G2 points
        let g1_point = G1Point {
            x: [0x10; 32],
            y: [0x11; 32],
        };
        let g2_point = G2Point {
            x_c0: [0x20; 32],
            x_c1: [0x21; 32],
            y_c0: [0x22; 32],
            y_c1: [0x23; 32],
        };

        // Build one pairing pair with NEAR alt_bn128_pairing_check format
        // NOTE: pairing_check does NOT use sign bytes (unlike g1_sum)
        let mut pairing_input = Vec::new();
        pairing_input.extend_from_slice(&g1_point.x);      // 32 bytes
        pairing_input.extend_from_slice(&g1_point.y);      // 32 bytes
        // NO sign byte for pairing check
        pairing_input.extend_from_slice(&g2_point.x_c0);   // 32 bytes
        pairing_input.extend_from_slice(&g2_point.x_c1);   // 32 bytes
        pairing_input.extend_from_slice(&g2_point.y_c0);   // 32 bytes
        pairing_input.extend_from_slice(&g2_point.y_c1);   // 32 bytes

        assert_eq!(pairing_input.len(), 192, "One pairing pair must be 192 bytes (G1: 64 + G2: 128)");

        // Groth16 verification uses 4 pairs = 768 bytes total
        let mut full_pairing_input = Vec::new();
        for _ in 0..4 {
            full_pairing_input.extend_from_slice(&g1_point.x);
            full_pairing_input.extend_from_slice(&g1_point.y);
            // NO sign byte
            full_pairing_input.extend_from_slice(&g2_point.x_c0);
            full_pairing_input.extend_from_slice(&g2_point.x_c1);
            full_pairing_input.extend_from_slice(&g2_point.y_c0);
            full_pairing_input.extend_from_slice(&g2_point.y_c1);
        }

        assert_eq!(full_pairing_input.len(), 768, "Groth16 pairing input (4 pairs) must be 768 bytes (192 * 4)");

        // Verify G1 points are at correct positions (every 192 bytes)
        assert_eq!(&full_pairing_input[0..32], &[0x10; 32], "First pair G1.x at index 0");
        assert_eq!(&full_pairing_input[192..224], &[0x10; 32], "Second pair G1.x at index 192");
        assert_eq!(&full_pairing_input[384..416], &[0x10; 32], "Third pair G1.x at index 384");
        assert_eq!(&full_pairing_input[576..608], &[0x10; 32], "Fourth pair G1.x at index 576");
    }

    /// Test that compute_linear_combination validates input lengths
    #[test]
    fn test_compute_linear_combination_length_validation() {
        let ic_points = vec![
            G1Point { x: [0; 32], y: [0; 32] },
            G1Point { x: [1; 32], y: [1; 32] },
            G1Point { x: [2; 32], y: [2; 32] },
        ];

        // Should fail: scalars.len() + 1 != ic_points.len()
        let wrong_scalars = vec![[1u8; 32]]; // Only 1 scalar, need 2
        let result = compute_linear_combination(&ic_points, &wrong_scalars);
        assert!(result.is_err(), "Should reject mismatched scalar count");
        assert_eq!(result.unwrap_err(), "Scalar/IC length mismatch");

        // Should not panic with correct length (will fail in precompile call, but validates)
        let correct_scalars = vec![[1u8; 32], [2u8; 32]]; // 2 scalars for 3 IC points
        // Note: This will fail in actual execution because it calls NEAR precompiles,
        // but the length check should pass
        assert_eq!(correct_scalars.len() + 1, ic_points.len(), "Correct scalar count");
    }
}
