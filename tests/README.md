# Integration Tests

End-to-end integration tests for NEAR Private Payroll using real Groth16 proofs.

## Prerequisites

1. **Build contracts:**
   ```bash
   cargo near build --no-docker
   ```

2. **Build circuits:**
   ```bash
   ./scripts/build-circuits.sh
   ```

3. **Generate image IDs:**
   ```bash
   ./scripts/generate_image_ids.sh
   ```
   This creates `scripts/image_ids.json` with real circuit image IDs.

4. **Start proof server:**

   **Option A: DEV_MODE (fast, mock proofs)**
   ```bash
   DEV_MODE=true cargo run -p proof-server
   ```
   - Instant proof generation
   - Proofs will FAIL verification (expected)
   - Useful for testing proof generation API

   **Option B: PRODUCTION (real Groth16, slow)**
   ```bash
   cargo run -p proof-server
   ```
   - ~2 minute proof generation time
   - Real Groth16 proofs
   - Proofs will PASS verification ✓

## Running Tests

```bash
cd tests
npm test
```

Or run a specific test:
```bash
npm test -- --match="*full income proof flow*"
```

## Test Coverage

### Setup Tests
- ✅ `setup: register REAL verification key and image IDs`
  - Loads real VK from `scripts/risc0_vk.json`
  - Registers VK for all proof types
  - Registers circuit image IDs
- ✅ `setup: add employee with payments`
  - Creates test employee
  - Adds payment history

### Proof Server Tests
- ✅ `proof-server: health check`
- ✅ `proof-server: generate income threshold proof`
- ✅ `proof-server: generate income range proof`
- ✅ `proof-server: generate credit score proof`
- ✅ `proof-server: income threshold proof with failing condition`

### Integration Tests
- ✅ `integration: full income proof flow with REAL verification`
  - Generates proof via proof server
  - Submits to payroll contract
  - Verifies proof on-chain
  - Tests disclosure flow
  - **DEV_MODE**: Expects verification to FAIL
  - **PRODUCTION**: Expects verification to PASS

## Test Modes

### DEV_MODE=true (Mock Proofs)
```
Proof Server: DEV_MODE (mock proofs)
  1. Proof generated instantly
  2. Contract receives proof
  3. Groth16 verification FAILS (expected)
  4. Tests proof generation API
```

### Production (Real Groth16)
```
Proof Server: PRODUCTION (real Groth16)
  1. Proof generated (~2 minutes)
  2. Contract receives proof
  3. Groth16 verification PASSES ✓
  4. Proof stored on-chain ✓
  5. Bank verification successful ✓
```

## Test Output Example

```
========================================
  Integration Test Suite
========================================
  Proof Server: http://localhost:3000
  Payroll: payroll.test.near
  ZK Verifier: zkverifier.test.near
  Employee: emp1.test.near
  Bank: bank.test.near
========================================

✓ setup: register REAL verification key and image IDs
  ✓ Loaded VK from scripts/risc0_vk.json
  ✓ Registered VK for IncomeThreshold
  ✓ Registered VK for IncomeRange
  ✓ Registered image ID for IncomeThreshold

✓ integration: full income proof flow with REAL verification
  Employee has 3 payments
  Generating proof via proof-server...
  Mode: PRODUCTION (real Groth16)
  ✓ Proof generated (288 bytes, 125432ms)
  Submitting proof to contract...
  ✓ Proof submitted and verified successfully
  ✓ Verified proof stored on-chain
  ✓ Disclosure granted to bank
  Bank verification result: true

  ==========================================
  INTEGRATION TEST SUMMARY:
  1. Proof-server mode: PRODUCTION
  2. Proof generated successfully
  3. Contract received and processed proof
  4. Groth16 verification PASSED ✓
  5. Proof stored on-chain ✓
  6. Bank verification successful ✓
  ==========================================
```

## Troubleshooting

### "Proof server not running"
Start the proof server:
```bash
cargo run -p proof-server
```

### "Failed to read WASM file"
Build contracts first:
```bash
cargo near build --no-docker
```

### "Using placeholder image IDs"
Generate real image IDs:
```bash
./scripts/generate_image_ids.sh
```

### "Groth16 verification failed" (with production mode)
- Ensure VK is registered correctly
- Check that image IDs match the built circuits
- Verify circuits are built: `ls target/riscv32im-risc0-zkvm-elf/docker/`

### Proof generation takes too long
- Use DEV_MODE for faster testing: `DEV_MODE=true cargo run -p proof-server`
- Real Groth16 proofs take ~2 minutes on powerful hardware

## Architecture

```
Test Suite
   │
   ├─> Loads real VK from risc0_vk.json
   ├─> Loads image IDs from image_ids.json
   │
   ├─> Deploys contracts to NEAR sandbox
   │   ├─> payroll contract
   │   ├─> wzec token
   │   └─> zk-verifier
   │
   ├─> Registers VK and image IDs
   │
   ├─> Calls proof server API
   │   └─> Generates Groth16 proof
   │
   ├─> Submits proof to contract
   │   └─> Contract verifies via alt_bn128
   │
   └─> Tests disclosure & verification flow
```

## Files

- `integration.test.ts` - Main integration tests
- `payroll.test.ts` - Payroll contract unit tests
- `setup.ts` - Test configuration
- `package.json` - Dependencies and scripts
- `README.md` - This file

## CI/CD

For CI/CD pipelines, use DEV_MODE to avoid long proof generation times:

```yaml
# .github/workflows/test.yml
- name: Run integration tests
  env:
    DEV_MODE: true
  run: |
    cargo run -p proof-server &
    sleep 3
    cd tests && npm test
```

For full end-to-end testing with real proofs, run in nightly CI:

```yaml
# .github/workflows/nightly.yml
- name: Run full Groth16 tests
  run: |
    ./scripts/generate_image_ids.sh
    cargo run -p proof-server &
    sleep 3
    cd tests && npm test
```
