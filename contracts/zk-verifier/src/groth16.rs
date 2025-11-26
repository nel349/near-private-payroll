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
    // Deserialize the RISC Zero seal structure
    let seal: RiscZeroSeal = bincode::deserialize(seal_bytes)
        .map_err(|e| format!("Failed to deserialize RISC Zero seal: {}", e))?;

    // Helper to convert Vec<u8> to [u8; 32]
    let to_array = |vec: &Vec<u8>| -> Result<[u8; 32], String> {
        if vec.len() != 32 {
            return Err(format!("Expected 32 bytes, got {}", vec.len()));
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&vec);
        Ok(arr)
    };

    // Parse G1 point A
    if seal.a.len() != 2 {
        return Err(format!("Invalid G1 point A: expected 2 coordinates, got {}", seal.a.len()));
    }
    let a = G1Point {
        x: to_array(&seal.a[0])?,
        y: to_array(&seal.a[1])?,
    };

    // Parse G2 point B
    if seal.b.len() != 2 {
        return Err(format!("Invalid G2 point B: expected 2 Fp2 elements, got {}", seal.b.len()));
    }
    if seal.b[0].len() != 2 || seal.b[1].len() != 2 {
        return Err("Invalid G2 point B: Fp2 elements must have 2 components each".to_string());
    }
    let b = G2Point {
        x_c0: to_array(&seal.b[0][0])?,
        x_c1: to_array(&seal.b[0][1])?,
        y_c0: to_array(&seal.b[1][0])?,
        y_c1: to_array(&seal.b[1][1])?,
    };

    // Parse G1 point C
    if seal.c.len() != 2 {
        return Err(format!("Invalid G1 point C: expected 2 coordinates, got {}", seal.c.len()));
    }
    let c = G1Point {
        x: to_array(&seal.c[0])?,
        y: to_array(&seal.c[1])?,
    };

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

    let mut pairing_input = Vec::new();

    // Pair 1: e(A, B)
    pairing_input.extend_from_slice(&proof.a.x);
    pairing_input.extend_from_slice(&proof.a.y);
    pairing_input.extend_from_slice(&proof.b.x_c0);
    pairing_input.extend_from_slice(&proof.b.x_c1);
    pairing_input.extend_from_slice(&proof.b.y_c0);
    pairing_input.extend_from_slice(&proof.b.y_c1);

    // Pair 2: e(-α, β) = e(negate(α), β)
    let neg_alpha = negate_g1(&vk.alpha_g1)?;
    pairing_input.extend_from_slice(&neg_alpha.x);
    pairing_input.extend_from_slice(&neg_alpha.y);
    pairing_input.extend_from_slice(&vk.beta_g2.x_c0);
    pairing_input.extend_from_slice(&vk.beta_g2.x_c1);
    pairing_input.extend_from_slice(&vk.beta_g2.y_c0);
    pairing_input.extend_from_slice(&vk.beta_g2.y_c1);

    // Pair 3: e(-C, δ) = e(negate(C), δ)
    let neg_c = negate_g1(&proof.c)?;
    pairing_input.extend_from_slice(&neg_c.x);
    pairing_input.extend_from_slice(&neg_c.y);
    pairing_input.extend_from_slice(&vk.delta_g2.x_c0);
    pairing_input.extend_from_slice(&vk.delta_g2.x_c1);
    pairing_input.extend_from_slice(&vk.delta_g2.y_c0);
    pairing_input.extend_from_slice(&vk.delta_g2.y_c1);

    // Pair 4: e(-vk_ic, γ) = e(negate(vk_ic), γ)
    let neg_vk_ic = negate_g1(&vk_ic)?;
    pairing_input.extend_from_slice(&neg_vk_ic.x);
    pairing_input.extend_from_slice(&neg_vk_ic.y);
    pairing_input.extend_from_slice(&vk.gamma_g2.x_c0);
    pairing_input.extend_from_slice(&vk.gamma_g2.x_c1);
    pairing_input.extend_from_slice(&vk.gamma_g2.y_c0);
    pairing_input.extend_from_slice(&vk.gamma_g2.y_c1);

    // 3. Call NEAR's alt_bn128_pairing_check precompile
    // Returns true if the pairing equation holds
    Ok(env::alt_bn128_pairing_check(&pairing_input))
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

    // Start with IC[0]
    let mut result = ic_points[0].clone();

    // Add each scalar[i] * IC[i+1]
    for (i, scalar) in scalars.iter().enumerate() {
        let point = &ic_points[i + 1];
        let scaled = scalar_mul_g1(point, scalar)?;
        result = add_g1(&result, &scaled)?;
    }

    Ok(result)
}

/// Negate a G1 point by negating the y-coordinate
/// On BN254, if P = (x, y), then -P = (x, -y) = (x, p - y)
/// where p is the field modulus
fn negate_g1(point: &G1Point) -> Result<G1Point, String> {
    // BN254 field modulus (p)
    // p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
    const BN254_MODULUS: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
        0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
        0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d,
        0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
    ];

    // Compute p - y (modular negation)
    let mut neg_y = [0u8; 32];
    let mut borrow = 0u16;

    for i in (0..32).rev() {
        let diff = BN254_MODULUS[i] as u16 - point.y[i] as u16 - borrow;
        neg_y[i] = (diff & 0xFF) as u8;
        borrow = if diff > 0xFF { 1 } else { 0 };
    }

    Ok(G1Point {
        x: point.x,
        y: neg_y,
    })
}

/// Scalar multiplication on G1: scalar * point
/// Uses NEAR's alt_bn128_g1_multiexp precompile
fn scalar_mul_g1(point: &G1Point, scalar: &[u8; 32]) -> Result<G1Point, String> {
    // Format for alt_bn128_g1_multiexp: [x, y, scalar]
    let mut input = Vec::with_capacity(96);
    input.extend_from_slice(&point.x);
    input.extend_from_slice(&point.y);
    input.extend_from_slice(scalar);

    let result = env::alt_bn128_g1_multiexp(&input);

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
    // Format for alt_bn128_g1_sum: [x1, y1, x2, y2]
    let mut input = Vec::with_capacity(128);
    input.extend_from_slice(&point1.x);
    input.extend_from_slice(&point1.y);
    input.extend_from_slice(&point2.x);
    input.extend_from_slice(&point2.y);

    let result = env::alt_bn128_g1_sum(&input);

    if result.len() != 64 {
        return Err("Invalid sum result".to_string());
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
}
