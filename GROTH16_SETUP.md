# Groth16 Setup Quick Reference

This is a quick reference for setting up and using Groth16 proofs with RISC Zero on NEAR.

## 🎯 Quick Start for New Deployments

### 1. Register the Universal Verification Key (ONE TIME ONLY)

```bash
# This registers the SAME key for ALL circuit types
./scripts/register_vk.sh zk-verifier.testnet admin.testnet
```

**What this does:** Registers RISC Zero's universal Groth16 verification key for all proof types (income_threshold, income_range, credit_score, payment, balance).

**When to do this:** Once per deployment (testnet/mainnet).

### 2. Build Your Circuits

```bash
./scripts/build-circuits.sh
```

**What this does:** Compiles all RISC Zero guest programs to ELF binaries.

### 3. Register Circuit Image IDs

```bash
# Compute image IDs
cargo test -p proof-server --test compute_image_ids -- --nocapture

# Copy the output commands and run them, e.g.:
near call zk-verifier.testnet register_image_id \
  '{"proof_type":"income_threshold","image_id":[...]}' \
  --accountId admin.testnet --gas 300000000000000
```

**What this does:** Registers the cryptographic hash (image_id) of each circuit.

**When to do this:**
- After building circuits for the first time
- After rebuilding circuits (image_id changes)

### 4. Generate and Verify Proofs

```bash
# Start proof server
ELF_DIR="$PWD/target/riscv32im-risc0-zkvm-elf/docker" cargo run -p proof-server

# Generate a proof (in another terminal)
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
  }'

# Verify on-chain
near call zk-verifier.testnet verify_proof \
  '{"proof_type":"income_threshold","proof_data":"..."}' \
  --accountId alice.testnet --gas 300000000000000
```

---

## 🔧 Adding a New Circuit Type

Follow this checklist when adding a new proof type:

- [ ] **Step 1:** Create guest program in `circuits/my-new-proof/`
- [ ] **Step 2:** Build: `./scripts/build-circuits.sh`
- [ ] **Step 3:** Compute image_id: `cargo test --test compute_image_ids`
- [ ] **Step 4:** Register image_id on-chain (NOT a new VK!)
- [ ] **Step 5:** Update proof-server to support new type
- [ ] **Step 6:** Test: generate proof → verify on-chain

**⚠️ Important:** You do NOT register a new verification key! The universal VK works for all circuits.

---

## 📚 Detailed Documentation

For detailed guides, see:

- **Adding new proof types:** [`docs/ADDING_PROOF_TYPES.md`](docs/ADDING_PROOF_TYPES.md)
- **Architecture details:** [`docs/TRUSTLESS_ARCHITECTURE_PLAN.md`](docs/TRUSTLESS_ARCHITECTURE_PLAN.md)
- **VK registration:** [`scripts/README.md`](scripts/README.md)

---

## 🧠 Key Concepts

### Universal Verification Key

```
┌─────────────────────────────────────────┐
│  RISC Zero Universal Verification Key   │
│  ONE key for ALL circuits               │
│  Register ONCE                          │
└─────────────────────────────────────────┘
              ↓
   ┌──────────────────────┐
   │  Recursion Circuit   │
   │  "STARK is valid"    │
   └──────────────────────┘
              ↓
┌──────┬──────┬──────┬──────┐
│Income│Payment│Balance│Custom│
│      │      │       │      │
│hash1 │hash2 │hash3  │hash4 │
└──────┴──────┴──────┴──────┘
```

### What Gets Registered?

| Component | Frequency | Purpose |
|-----------|-----------|---------|
| **Verification Key** | Once per deployment | Verifies Groth16 proofs for recursion circuit |
| **Image ID** | Once per circuit | Identifies which circuit was proven |

### Proof Package Format

```
┌─────────────┬─────────────┬─────────────┐
│  image_id   │    seal     │   journal   │
│  32 bytes   │  256 bytes  │  variable   │
└─────────────┴─────────────┴─────────────┘
     ↓              ↓              ↓
 Circuit ID    Groth16      Public outputs
              A, B, C
```

---

## ⚡ Performance

### Proof Generation (Local)

| Hardware | Time |
|----------|------|
| M1/M2 Mac | ~2 minutes |
| Modern Desktop (8+ cores) | ~2-3 minutes |
| Laptop (4 cores) | ~5-10 minutes |

### On-Chain Verification

- **Gas Cost:** ~200-300 TGas
- **Time:** < 1 second
- **Cost:** Cheap (uses alt_bn128 precompile)

---

## 🚨 Common Issues

### "Image ID mismatch"
**Fix:** Recompute and re-register the image_id for that circuit.

### "Verification key not found"
**Fix:** Run `./scripts/register_vk.sh`

### "Pairing check failed"
**Fix:** Ensure VK is registered correctly and proof is generated with same RISC Zero version.

### Proof generation too slow
**Fix:** Use more powerful hardware or consider Bonsai API (optional).

---

## 🔗 Useful Commands

```bash
# Check VK registration
near view zk-verifier.testnet get_verification_key '{"proof_type":"income_threshold"}'

# Check image_id registration
near view zk-verifier.testnet get_image_id '{"proof_type":"income_threshold"}'

# Regenerate VK JSON
cargo test -p proof-server --test format_vk_for_near -- --nocapture

# Compute all image IDs
cargo test -p proof-server --test compute_image_ids -- --nocapture

# Build all circuits
./scripts/build-circuits.sh

# Start proof server
ELF_DIR="$PWD/target/riscv32im-risc0-zkvm-elf/docker" cargo run -p proof-server
```

---

## 📦 What's Included

This repository includes:

- ✅ Local Groth16 proof generation (no Bonsai required)
- ✅ Universal verification key (pre-generated)
- ✅ On-chain verification using NEAR's alt_bn128 precompiles
- ✅ Scripts for VK and image_id registration
- ✅ Helper tools for computing image IDs
- ✅ Example circuits (income, payment, balance proofs)
- ✅ Proof server with REST API
- ✅ Comprehensive documentation

---

## 🎓 Learn More

- **RISC Zero:** https://dev.risczero.com/
- **Groth16 Paper:** https://eprint.iacr.org/2016/260.pdf
- **NEAR alt_bn128:** https://docs.near.org/develop/contracts/environment/environment
- **Project Docs:** `docs/` directory

---

**Need help?** Check the [detailed guide](docs/ADDING_PROOF_TYPES.md) or open an issue.
