# Scripts Directory

This directory contains utilities for RISC Zero proof generation, verification key registration, and testing for the NEAR Private Payroll ZK Verifier contract.

## Overview

RISC Zero uses a **single universal verification key** for all proof types. This is because:

1. **Application circuits** (income-proof, payment-proof, etc.) are verified in the **STARK layer**
2. The **Groth16 layer** only proves: "this STARK proof is valid"
3. The Groth16 circuit verifies the **recursion circuit**, not individual application circuits
4. This allows one VK to work for all proof types

## Files

### Proof Generation
- `start_proof_server.sh` - Start the RISC Zero proof server
- `generate_test_proof.sh` - Generate a test proof and save to file
- `test_proofs/` - Directory for generated test proofs

### Verification Key & Registration
- `risc0_vk.json` - RISC Zero's universal Groth16 verification key in NEAR format
- `register_vk.sh` - Script to register the VK on-chain for all proof types
- `register_image_ids.sh` - Helper script to register circuit image IDs
- `build-circuits.sh` - Build all RISC Zero circuits to ELF binaries
- `format_vk_for_near.rs` - Test utility in proof-server to generate the VK JSON
- `compute_image_ids.rs` - Test utility in proof-server to compute circuit image IDs

## Quick Start: Generate a Proof

### 1. Start the Proof Server

```bash
# Development mode
./scripts/start_proof_server.sh

# Or production mode (faster)
./scripts/start_proof_server.sh --release
```

The server will start at `http://localhost:3000`

### 2. Generate a Test Proof

```bash
# Generate an income threshold proof (default)
./scripts/generate_test_proof.sh

# Generate a specific proof type
./scripts/generate_test_proof.sh income_range

# Specify output file
./scripts/generate_test_proof.sh income_threshold ./my_proof.json
```

**Supported proof types:**
- `income_threshold` - Prove income meets a minimum threshold
- `income_range` - Prove income is within a range
- `average_income` - Prove average income meets threshold
- `credit_score` - Prove credit score meets threshold

The script will:
- Check if the proof server is running
- Generate a proof (~1-2 minutes for STARK + Groth16)
- Save the proof to `scripts/test_proofs/{proof_type}.json`
- Display proof details and structure

## Generating the Verification Key

If you need to regenerate the verification key (e.g., after RISC Zero updates):

```bash
# Run the formatting test to extract the VK
cargo test -p proof-server --test format_vk_for_near -- --nocapture

# Copy the JSON output to risc0_vk.json
```

The test reads the VK constants from `risc0-groth16` crate and formats them for NEAR.

## Registering the Verification Key

### Prerequisites

1. Deploy the `zk-verifier` contract to NEAR
2. Install `near-cli`: `npm install -g near-cli`
3. Login to your NEAR account: `near login`

### Registration

Run the registration script:

```bash
./scripts/register_vk.sh <contract-account-id> <signer-account-id>
```

Example:
```bash
./scripts/register_vk.sh zk-verifier.testnet alice.testnet
```

This will register the same verification key for all proof types:
- `income_threshold`
- `income_range`
- `credit_score`
- `payment`
- `balance`

## Verification Key Structure

The verification key contains:

```json
{
  "alpha_g1": {       // G1 point (64 bytes)
    "x": "0x...",     // 32-byte field element
    "y": "0x..."      // 32-byte field element
  },
  "beta_g2": {        // G2 point (128 bytes)
    "x_c0": "0x...",  // Fp2 coordinate (c0 component)
    "x_c1": "0x...",  // Fp2 coordinate (c1 component)
    "y_c0": "0x...",
    "y_c1": "0x..."
  },
  "gamma_g2": { ... },  // G2 point (128 bytes)
  "delta_g2": { ... },  // G2 point (128 bytes)
  "ic": [               // IC points (G1 array)
    { "x": "0x...", "y": "0x..." },  // IC[0]
    { "x": "0x...", "y": "0x..." },  // IC[1]
    ...
  ]
}
```

## On-Chain Verification

Once registered, the contract can verify Groth16 proofs using NEAR's alt_bn128 precompiles:

1. Parse the seal (A, B, C points)
2. Compute vk_ic from public inputs
3. Verify pairing equation: `e(A,B) * e(-α,β) * e(-C,δ) * e(-vk_ic,γ) == 1`

See `contracts/zk-verifier/src/groth16.rs` for the implementation.

## Registering Image IDs

After registering the verification key, you must register the **image ID** for each circuit.

### Computing Image IDs

```bash
# Compute image IDs for all built circuits
cargo test -p proof-server --test compute_image_ids -- --nocapture
```

This will output the exact registration commands for each circuit.

### Registration

```bash
# For each circuit type
near call zk-verifier.testnet register_image_id \
  '{"proof_type":"income_threshold","image_id":[1,2,3,...,32]}' \
  --accountId admin.testnet \
  --gas 300000000000000
```

### Helper Script

```bash
# Run the helper script for guidance
./scripts/register_image_ids.sh zk-verifier.testnet admin.testnet
```

This script will help you compute and register all image IDs.

### Important Notes

- **Image IDs change** when you rebuild a circuit (the ELF binary hash changes)
- **Verification key NEVER changes** (it's universal)
- You must register image IDs AFTER registering the VK
- Each circuit type needs its own image_id registered

## Notes

- The verification key is **permanent** for a given RISC Zero version
- You only need to register the VK **once per deployment**
- All proof types share the **same VK**
- The VK verifies the recursion layer, not your application circuits
- Each circuit has a **unique image_id** that must be registered separately
