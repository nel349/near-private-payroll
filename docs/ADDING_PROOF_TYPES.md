# Adding Proof Types and Verification Key Setup

This guide covers two scenarios:
1. **Adding a new proof type** to an existing deployment (most common)
2. **Initial verification key setup** for a brand new deployment

## Table of Contents

- [Understanding RISC Zero's Architecture](#understanding-risc-zeros-architecture)
- [Scenario 1: Adding a New Proof Type](#scenario-1-adding-a-new-proof-type)
- [Scenario 2: Initial Verification Key Setup](#scenario-2-initial-verification-key-setup)
- [Testing Your Implementation](#testing-your-implementation)
- [Troubleshooting](#troubleshooting)

---

## Understanding RISC Zero's Architecture

Before proceeding, understand this critical concept:

### One Universal Verification Key for All Circuits

```
┌─────────────────────────────────────────────────────────────┐
│  RISC Zero Universal Verification Key                       │
│  - ONE key for ALL your circuits                            │
│  - Verifies the recursion circuit (not your app circuit)    │
│  - Registered ONCE during initial deployment                │
└─────────────────────────────────────────────────────────────┘
                              ↓
        ┌──────────────────────────────────────────┐
        │         RISC Zero Recursion Layer        │
        │   "This STARK proof is valid for..."     │
        └──────────────────────────────────────────┘
                              ↓
    ┌──────────┬──────────┬──────────┬──────────────┐
    │ Income   │ Payment  │ Balance  │ Custom       │
    │ Proof    │ Proof    │ Proof    │ Proof        │
    │          │          │          │              │
    │ image_id │ image_id │ image_id │ image_id     │
    │ = hash1  │ = hash2  │ = hash3  │ = hash4      │
    └──────────┴──────────┴──────────┴──────────────┘
```

**Key Points:**
- Each circuit has a unique `image_id` (32-byte hash of the ELF binary)
- All circuits share the same universal verification key
- The VK verifies: "I checked a STARK proof"
- The image_id specifies: "for this specific circuit"

---

## Scenario 1: Adding a New Proof Type

When you want to add a new type of proof to your **existing deployment**.

### Step 1: Create the Guest Program (Circuit)

Create a new directory for your circuit:

```bash
mkdir -p circuits/my-new-proof
cd circuits/my-new-proof
```

Create `Cargo.toml`:

```toml
[package]
name = "my-new-proof"
version = "0.1.0"
edition = "2021"

[dependencies]
risc0-zkvm = { version = "3.0.4", default-features = false, features = ["std"] }
serde = { version = "1.0", default-features = false, features = ["derive"] }
```

Create `src/main.rs`:

```rust
#![no_main]

use risc0_zkvm::guest::env;

risc0_zkvm::guest::entry!(main);

fn main() {
    // 1. Read private inputs from the host
    let private_data: Vec<u64> = env::read();
    let threshold: u64 = env::read();

    // 2. Perform computation with private data
    let sum: u64 = private_data.iter().sum();
    let passes_check = sum > threshold;

    // 3. Commit public outputs to journal
    // These will be visible on-chain
    env::commit(&passes_check);
    env::commit(&sum);  // Optional: reveal the sum
}
```

**Important Guidelines:**
- Keep circuits simple and focused
- Minimize computation (it's expensive to prove)
- Only commit necessary data to the journal (it's public)
- Use fixed-size types for easier parsing on-chain

### Step 2: Build the Circuit

```bash
# From project root
./scripts/build-circuits.sh

# Or build individually
cargo build -p my-new-proof --release \
  --target riscv32im-risc0-zkvm-elf \
  --target-dir target/riscv32im-risc0-zkvm-elf
```

This generates:
```
target/riscv32im-risc0-zkvm-elf/docker/my-new-proof
```

### Step 3: Compute the Image ID

The image ID is a cryptographic hash of your circuit's ELF binary. Create a utility to compute it:

```rust
// proof-server/tests/compute_image_id.rs
use risc0_zkvm::compute_image_id;

#[test]
fn compute_my_new_proof_image_id() {
    let elf_bytes = include_bytes!(
        "../../target/riscv32im-risc0-zkvm-elf/docker/my-new-proof"
    );

    let image_id = compute_image_id(elf_bytes).unwrap();

    println!("\n=== My New Proof Circuit Image ID ===");
    println!("Image ID (hex): {}", hex::encode(&image_id));
    println!("Image ID (array): {:?}", image_id);
    println!("\nUse this to register on-chain:");
    println!("near call zk-verifier.testnet register_image_id \\");
    println!("  '{{\"proof_type\":\"my_new_proof\",\"image_id\":{:?}}}' \\",
             image_id.to_vec());
    println!("  --accountId admin.testnet");
}
```

Run it:
```bash
cargo test -p proof-server --test compute_image_id -- --nocapture
```

### Step 4: Register the Image ID On-Chain

**⚠️ IMPORTANT: You register the IMAGE_ID, NOT a new verification key!**

The verification key is universal - you only need to tell the contract which `image_id` corresponds to your new proof type.

```bash
# Using near-cli
near call zk-verifier.testnet register_image_id \
  '{"proof_type":"my_new_proof","image_id":[1,2,3,...,32]}' \
  --accountId admin.testnet \
  --gas 300000000000000
```

Or using TypeScript:
```typescript
await zkVerifierContract.register_image_id({
  proof_type: "my_new_proof",
  image_id: new Uint8Array([1, 2, 3, ..., 32])
});
```

### Step 5: Update the Proof Server

Add support for the new proof type in your proof server:

```rust
// proof-server/src/types/mod.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProofType {
    IncomeThreshold,
    IncomeRange,
    CreditScore,
    Payment,
    Balance,
    MyNewProof,  // <-- Add this
}

// proof-server/src/services/prover.rs

impl ProverService {
    fn get_guest_elf(&self, proof_type: &ProofType) -> Result<&'static [u8], ProverError> {
        match proof_type {
            ProofType::MyNewProof => {
                include_bytes!("../../target/riscv32im-risc0-zkvm-elf/docker/my-new-proof")
            }
            ProofType::IncomeThreshold => {
                include_bytes!("../../target/riscv32im-risc0-zkvm-elf/docker/income-proof")
            }
            // ... other cases
        }
    }

    fn get_image_id(&self, proof_type: &ProofType) -> [u8; 32] {
        match proof_type {
            ProofType::MyNewProof => {
                // The image_id you computed in step 3
                [1, 2, 3, ..., 32]
            }
            // ... other cases
        }
    }
}
```

### Step 6: Generate Proofs

Now users can generate proofs:

```bash
curl -X POST http://localhost:3000/api/v1/proof/generate \
  -H "Content-Type: application/json" \
  -d '{
    "proof_type": "my_new_proof",
    "params": {
      "private_data": [100, 200, 300, 400],
      "threshold": 500,
      "employee_id": "alice.near"
    }
  }'
```

The proof server will:
1. Load the ELF for `my_new_proof`
2. Generate STARK proof (~2 minutes)
3. Wrap with Groth16 using `ProverOpts::groth16()`
4. Return: `image_id (32 bytes) + seal (256 bytes) + journal (variable)`

### Step 7: Verify On-Chain

Submit the proof to the contract:

```typescript
const result = await zkVerifierContract.verify_proof({
  proof_type: "my_new_proof",
  proof_data: proofBytes  // Uint8Array from proof server
});

console.log("Verification result:", result);
```

The contract will:
1. Look up the registered `image_id` for `my_new_proof`
2. Extract the `image_id` from the proof (first 32 bytes)
3. Verify they match
4. Parse the Groth16 seal (next 256 bytes)
5. Extract public inputs from the journal (remaining bytes)
6. **Use the existing universal VK** to verify the Groth16 proof
7. Return verification result + parsed journal data

---

## Scenario 2: Initial Verification Key Setup

When deploying the zk-verifier contract for the **first time** or on a **new network**.

### Prerequisites

- Deployed `zk-verifier` contract on NEAR
- NEAR CLI installed: `npm install -g near-cli`
- Logged in: `near login`

### Step 1: Ensure Verification Key is Generated

The verification key should already be in `scripts/risc0_vk.json`. If not, regenerate it:

```bash
# Generate the verification key JSON
cargo test -p proof-server --test format_vk_for_near -- --nocapture

# This outputs the VK in JSON format
# Copy the JSON between the { } to scripts/risc0_vk.json
```

### Step 2: Understand the Verification Key Structure

The VK contains the Groth16 verification key for RISC Zero's recursion circuit:

```json
{
  "alpha_g1": {
    "x": "0x...",
    "y": "0x..."
  },
  "beta_g2": {
    "x_c0": "0x...",
    "x_c1": "0x...",
    "y_c0": "0x...",
    "y_c1": "0x..."
  },
  "gamma_g2": { /* G2 point */ },
  "delta_g2": { /* G2 point */ },
  "ic": [
    { "x": "0x...", "y": "0x..." },  // IC[0]
    { "x": "0x...", "y": "0x..." },  // IC[1]
    // ... IC[2] through IC[5]
  ]
}
```

**This VK is:**
- Provided by RISC Zero (from `risc0-groth16` crate)
- The same for everyone using RISC Zero
- Does NOT change when you add new circuits
- Only needs to be registered ONCE per deployment

### Step 3: Register Verification Key On-Chain

**Option A: Using the Registration Script (Recommended)**

```bash
./scripts/register_vk.sh <contract-account-id> <signer-account-id>

# Example:
./scripts/register_vk.sh zk-verifier.testnet admin.testnet
```

This will register the VK for ALL proof types in one go:
- `income_threshold`
- `income_range`
- `credit_score`
- `payment`
- `balance`

**Option B: Manual Registration**

Register for each proof type individually:

```bash
# Read the VK JSON
VK_JSON=$(cat scripts/risc0_vk.json)

# Register for each proof type
for proof_type in income_threshold income_range credit_score payment balance; do
  near call zk-verifier.testnet register_verification_key \
    "{\"proof_type\":\"$proof_type\",\"vk\":$VK_JSON}" \
    --accountId admin.testnet \
    --gas 300000000000000
done
```

**Option C: TypeScript SDK**

```typescript
import * as fs from 'fs';

const vk = JSON.parse(fs.readFileSync('scripts/risc0_vk.json', 'utf8'));

const proofTypes = [
  'income_threshold',
  'income_range',
  'credit_score',
  'payment',
  'balance'
];

for (const proofType of proofTypes) {
  await zkVerifierContract.register_verification_key({
    proof_type: proofType,
    vk: vk
  });
  console.log(`✅ Registered VK for ${proofType}`);
}
```

### Step 4: Register Image IDs

After registering the VK, register the image ID for each circuit:

```bash
# For each circuit you have built
near call zk-verifier.testnet register_image_id \
  '{"proof_type":"income_threshold","image_id":[1,2,3,...,32]}' \
  --accountId admin.testnet \
  --gas 300000000000000
```

You can get image IDs from your proof server or by running:

```bash
cargo test -p proof-server --test compute_image_ids -- --nocapture
```

### Step 5: Verify Setup

Query the contract to verify registration:

```bash
# Check if VK is registered
near view zk-verifier.testnet get_verification_key \
  '{"proof_type":"income_threshold"}'

# Check if image_id is registered
near view zk-verifier.testnet get_image_id \
  '{"proof_type":"income_threshold"}'
```

Expected output:
```json
{
  "alpha_g1": { "x": "0x...", "y": "0x..." },
  "beta_g2": { ... },
  // ... full VK structure
}
```

### Step 6: Test End-to-End

Generate and verify a test proof:

```bash
# 1. Generate a proof
curl -X POST http://localhost:3000/api/v1/proof/generate \
  -H "Content-Type: application/json" \
  -d '{
    "proof_type": "income_threshold",
    "params": {
      "payment_history": [5000, 5000, 5200],
      "threshold": 4000,
      "history_commitment": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      "employee_id": "alice.near"
    }
  }' > proof.json

# 2. Extract the proof_data from response
PROOF_DATA=$(cat proof.json | jq -r .proof_data)

# 3. Submit to contract
near call zk-verifier.testnet verify_proof \
  "{\"proof_type\":\"income_threshold\",\"proof_data\":\"$PROOF_DATA\"}" \
  --accountId alice.testnet \
  --gas 300000000000000
```

If successful, you'll see:
```json
{
  "verified": true,
  "journal": {
    "threshold": 4000,
    "result": true,
    // ... other public outputs
  }
}
```

---

## Testing Your Implementation

### Unit Tests

Test your circuit locally:

```rust
#[cfg(test)]
mod tests {
    use risc0_zkvm::{default_prover, ExecutorEnv};

    #[test]
    fn test_my_new_proof() {
        let env = ExecutorEnv::builder()
            .write(&vec![100u64, 200, 300])  // private_data
            .write(&500u64)                   // threshold
            .build()
            .unwrap();

        let prover = default_prover();
        let receipt = prover.prove(env, MY_NEW_PROOF_ELF).unwrap();

        // Verify locally
        receipt.verify(MY_NEW_PROOF_IMAGE_ID).unwrap();

        // Check journal
        let result: bool = receipt.journal.decode().unwrap();
        assert_eq!(result, true);
    }
}
```

### Integration Tests

Test the full flow:

```bash
# 1. Start proof server
ELF_DIR="$PWD/target/riscv32im-risc0-zkvm-elf/docker" cargo run -p proof-server

# 2. Generate proof
curl -X POST http://localhost:3000/api/v1/proof/generate \
  -H "Content-Type: application/json" \
  -d '{"proof_type":"my_new_proof","params":{...}}' \
  -o test_proof.json

# 3. Verify on testnet
near call zk-verifier.testnet verify_proof \
  "$(cat test_proof.json)" \
  --accountId test.testnet
```

---

## Troubleshooting

### Problem: "Image ID mismatch"

**Cause:** The image_id in the proof doesn't match the registered one.

**Solution:**
1. Recompute the image_id from your current ELF
2. Update the registration on-chain
3. Or rebuild your circuit if the ELF changed

### Problem: "Verification key not found"

**Cause:** VK not registered for this proof type.

**Solution:**
```bash
./scripts/register_vk.sh zk-verifier.testnet admin.testnet
```

### Problem: "Pairing check failed"

**Cause:** The Groth16 proof is invalid or VK is wrong.

**Solutions:**
1. Verify your VK matches RISC Zero's official VK
2. Regenerate the VK: `cargo test -p proof-server --test format_vk_for_near`
3. Ensure you're using compatible RISC Zero versions (proof-server and contracts)

### Problem: "Journal parsing failed"

**Cause:** Journal format doesn't match what the contract expects.

**Solution:**
1. Check your guest program's `env::commit()` calls
2. Ensure fixed-size encoding (u64 as LE bytes, bool as u32)
3. Update contract's journal parsing to match

### Problem: Proof generation is too slow

**Causes & Solutions:**
- **Hardware:** Groth16 proving is compute-intensive. Use a machine with:
  - 8+ CPU cores
  - 16+ GB RAM
  - Expected time: ~2 minutes per proof
- **Circuit complexity:** Simplify your guest program
- **Alternative:** Use Bonsai API for cloud-based proving

### Problem: Contract gas limit exceeded

**Cause:** Groth16 verification uses ~200K gas, but complex journal parsing can add more.

**Solutions:**
1. Simplify journal structure
2. Reduce number of public inputs
3. Increase gas limit: `--gas 300000000000000`

---

## Reference

### File Structure

```
near-private-payroll/
├── circuits/
│   ├── income-proof/           # Existing circuits
│   ├── payment-proof/
│   └── my-new-proof/           # Your new circuit
│       ├── Cargo.toml
│       └── src/main.rs
├── contracts/
│   └── zk-verifier/            # On-chain verifier
├── proof-server/               # Proof generation service
│   ├── src/
│   └── tests/
│       ├── format_vk_for_near.rs    # VK extraction
│       └── compute_image_id.rs      # Image ID computation
├── scripts/
│   ├── risc0_vk.json           # Universal verification key
│   ├── register_vk.sh          # VK registration script
│   └── build-circuits.sh       # Circuit build script
└── docs/
    └── ADDING_PROOF_TYPES.md   # This file
```

### Key Concepts

- **Verification Key (VK):** Universal key for all circuits, registered once
- **Image ID:** Unique 32-byte hash of each circuit's ELF binary
- **Seal:** 256-byte Groth16 proof (A, B, C points)
- **Journal:** Variable-size public outputs from your circuit
- **Proof Package:** `image_id (32) + seal (256) + journal (variable)`

### Gas Costs (NEAR)

- Register VK: ~5 TGas per proof type
- Register image_id: ~3 TGas
- Verify proof: ~200 TGas (Groth16) + journal parsing overhead
- Total verification: ~250-300 TGas recommended

### Proof Generation Time

| Hardware | Expected Time |
|----------|--------------|
| M1/M2 Mac | 1-2 minutes |
| Modern Desktop (8+ cores) | 2-3 minutes |
| Server (16+ cores) | 1-2 minutes |
| Laptop (4 cores) | 5-10 minutes |
| Bonsai API | 30-60 seconds |

---

## Next Steps

1. **Development:** Add your custom circuits following Scenario 1
2. **Deployment:** Set up VK using Scenario 2 when deploying to testnet/mainnet
3. **Integration:** Update your frontend/SDK to use the new proof types
4. **Testing:** Run end-to-end tests before mainnet deployment
5. **Monitoring:** Track proof generation and verification metrics

## Additional Resources

- [RISC Zero Documentation](https://dev.risczero.com/)
- [NEAR Protocol Docs](https://docs.near.org/)
- [BN254 Curve Specification](https://eips.ethereum.org/EIPS/eip-197)
- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
