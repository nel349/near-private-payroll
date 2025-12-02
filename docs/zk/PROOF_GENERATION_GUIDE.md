# Proof Generation Guide

Quick reference for generating RISC Zero Groth16 proofs for testing and development.

## Quick Start

### 1. Start the Proof Server

```bash
# From project root
./scripts/start_proof_server.sh

# Or for faster performance (release mode)
./scripts/start_proof_server.sh --release
```

The server will start at `http://localhost:3000`

### 2. Generate a Proof

```bash
# Generate an income threshold proof (default)
./scripts/generate_test_proof.sh

# Generate other proof types
./scripts/generate_test_proof.sh income_range
./scripts/generate_test_proof.sh average_income
./scripts/generate_test_proof.sh credit_score

# Custom output location
./scripts/generate_test_proof.sh income_threshold ./my_proof.json
```

Proofs are automatically saved to `scripts/test_proofs/{proof_type}.json`

## Proof Types & Parameters

### Income Threshold
Proves that income meets a minimum threshold.

```bash
./scripts/generate_test_proof.sh income_threshold
```

Default parameters:
- Payment history: [5000, 5000, 5200]
- Threshold: 4000
- Result: ✅ true (meets threshold)

### Income Range
Proves that income is within a specified range.

```bash
./scripts/generate_test_proof.sh income_range
```

Default parameters:
- Payment history: [5000, 5000, 5200]
- Min amount: 4000
- Max amount: 6000
- Result: ✅ true (within range)

### Average Income
Proves that average income meets a threshold.

```bash
./scripts/generate_test_proof.sh average_income
```

Default parameters:
- Payment history: [5000, 5000, 5200]
- Threshold: 5000
- Result: ✅ true (average ~5067 meets 5000)

### Credit Score
Proves a computed credit score meets a threshold.

```bash
./scripts/generate_test_proof.sh credit_score
```

Default parameters:
- Payment history: [5000, 5000, 5200]
- Threshold: 700
- Result: Computed based on payment consistency

## Generated Proof Structure

Each proof file contains:

```json
{
  "receipt": [/* 464 bytes */],
  "image_id": [/* 32 bytes */],
  "public_inputs": {
    "history_commitment": [/* 32 bytes */],
    "meets_threshold": true,
    "payment_count": 3,
    "threshold": 4000
  },
  "generation_time_ms": 59143,
  "proof_type": "income_threshold",
  "request_id": "...",
  "attestation": { /* TEE attestation if available */ }
}
```

### Receipt Byte Structure

The 464-byte receipt is structured as:

```
Offset   Size    Description
------   ----    -----------
0-31     32      Image ID (circuit identifier)
32-63    32      Claim digest
64-319   256     Groth16 seal (A + B + C points)
320-463  144     Journal (public outputs)
```

### Groth16 Seal Structure (256 bytes)

```
Offset   Size    Point    Description
------   ----    -----    -----------
0-63     64      A (G1)   x (32) + y (32)
64-191   128     B (G2)   x_c0 (32) + x_c1 (32) + y_c0 (32) + y_c1 (32)
192-255  64      C (G1)   x (32) + y (32)
```

**G2 Point Format:** ✅ NO SWAP (c0, c1) = (real, imaginary) in LITTLE-ENDIAN

## Performance

- **STARK proof generation:** ~15-20 seconds
- **Groth16 conversion:** ~30-40 seconds
- **Total time:** ~1 minute per proof

Release mode (`--release`) is slightly faster but requires longer compilation.

## Using Generated Proofs

### In Integration Tests

```typescript
import proofData from './scripts/test_proofs/income_threshold.json';

// Use in NEAR contract call
await contract.verify_income_threshold({
  receipt: proofData.receipt,
  expected_threshold: proofData.public_inputs.threshold,
  expected_commitment: proofData.public_inputs.history_commitment
});
```

### Manual Verification

```bash
# Using NEAR CLI
near call zk-verifier.testnet verify_income_proof \
  "$(cat scripts/test_proofs/income_threshold.json)" \
  --accountId alice.testnet \
  --gas 300000000000000
```

## Customizing Parameters

To generate proofs with custom parameters, edit `scripts/generate_test_proof.sh` and modify the PAYLOAD section for your proof type:

```bash
case "$PROOF_TYPE" in
    income_threshold)
        PAYLOAD='{
            "proof_type": "income_threshold",
            "params": {
                "payment_history": [6000, 6500, 7000],  # Custom values
                "threshold": 6000,                       # Custom threshold
                "history_commitment": [0,0,...],
                "employee_id": "alice.near"
            }
        }'
        ;;
```

## Troubleshooting

### Server Not Running

```bash
Error: Proof server not running at http://localhost:3000
```

**Solution:** Start the server first:
```bash
./scripts/start_proof_server.sh
```

### ELF Binaries Not Found

```bash
Warning: ELF directory not found
```

**Solution:** Build the circuits:
```bash
cargo build --release
```

### Proof Generation Timeout

If proof generation takes too long, the circuit ELF may be missing or corrupted.

**Solution:** Rebuild circuits:
```bash
cargo build --release -p income-proof
cargo build --release -p payment-proof
```

## Advanced Usage

### Generating Multiple Proofs

```bash
# Generate all proof types
for type in income_threshold income_range average_income credit_score; do
    ./scripts/generate_test_proof.sh $type
    sleep 2  # Small delay between proofs
done
```

### Background Generation

```bash
# Generate in background
./scripts/generate_test_proof.sh income_threshold &
PID=$!

# Wait for completion
wait $PID
echo "Proof ready at scripts/test_proofs/income_threshold.json"
```

### Custom API Endpoint

```bash
# Use different proof server
PROOF_SERVER_URL=http://remote-server:3000 \
  ./scripts/generate_test_proof.sh income_threshold
```

## Related Documentation

- `scripts/README.md` - Full scripts directory documentation
- `docs/G2_FORMAT_VERIFICATION_SUMMARY.md` - Proof format verification
- `proof-server/README.md` - Proof server API documentation
