# NEAR Private Payroll - Architecture

This document describes the system architecture, data flows, and security model.

## System Overview

```
                    +-----------------+
                    |  USER LAYER     |
                    |  Company Admin  |
                    |  Employee       |
                    |  Verifier (Bank)|
                    +--------+--------+
                             |
                    +--------v--------+
                    |  SDK LAYER      |
                    |  (TypeScript)   |
                    |  + Intents SDK  |
                    +--------+--------+
                             |
+------------------------------------------------------------+
|                    NEAR PROTOCOL                            |
|                                                             |
|  +--------------+  +--------------+  +----------------+    |
|  |   Payroll    |  |    wZEC      |  |  ZK Verifier   |    |
|  |   Contract   |  |    Token     |  |   Contract     |    |
|  |              |  |   (NEP-141)  |  |                |    |
|  | - employees  |  | - balances   |  | - image_ids    |    |
|  | - payments   |  | - bridge_ctrl|  | - verify_*     |    |
|  | - disclosures|  |              |  |                |    |
|  | - income_proofs|              |  |                |    |
|  +--------------+  +--------------+  +----------------+    |
|          |                                                  |
|  +-------v--------+                                         |
|  |    Intents     |  ← Cross-Chain Bridge                  |
|  |    Adapter     |                                         |
|  |                |                                         |
|  | - deposits     |  Enables:                              |
|  | - withdrawals  |  • Company deposits from Zcash         |
|  | - chain_config |  • Employee withdrawals to Zcash       |
|  | - relayers     |  • Multi-chain support (future)        |
|  +----------------+                                         |
+------------------------------------------------------------+
              |                      |
     +--------v--------+    +--------v--------+
     | RISC ZERO       |    | BRIDGE RELAYER  |
     | (Off-Chain)     |    | (Off-Chain)     |
     +-----------------+    +-----------------+
     |                 |    |                 |
     | Payment Proof   |    | Zallet RPC      |
     | Income Proof    |    | Deposit Monitor |
     | Balance Proof   |    | Withdrawal Exec |
     |                 |    |                 |
     | Generates       |    | Monitors Zcash  |
     | STARK proofs    |    | Executes wZEC   |
     +-----------------+    | bridge ops      |
                            +-----------------+
                                    |
                            +-------v-------+
                            | ZCASH NETWORK |
                            | (Testnet)     |
                            |               |
                            | Shielded txs  |
                            | Zallet wallet |
                            +---------------+
```

## Circuit Image IDs

Built with RISC Zero 3.0 via `cargo risczero build`:

| Circuit | Image ID |
|---------|----------|
| income-proof | `41b4f8f0b0e6b73b23b7184ee3db29ac53ef58552cef3703a08a3a558b0cf6ba` |
| payment-proof | `ce4e05f46415f148641544d55a7e5ab0172071adcd9b32d22ba7515bea42b4c2` |
| balance-proof | `07bba158a57dac5d87de94b8935536953ef30405e4d76b0428cb923f4f798c90` |

---

## Actor Roles

### Company Admin
- Initialize payroll contract
- Deposit wZEC funds
- Add/manage employees
- Process salary payments
- Update employee status

**Contract Calls:**
- `new(owner, wzec_token, zk_verifier)`
- `add_employee(id, encrypted_name, encrypted_salary, commitment, public_key)`
- `pay_employee(id, encrypted_amount, commitment, proof)`

### Employee
- Receive salary payments
- Withdraw earned balance
- Generate ZK income proofs (locally)
- Grant/revoke disclosures to verifiers

**Contract Calls:**
- `withdraw(amount)`
- `submit_income_proof(type, threshold, receipt)`
- `grant_disclosure(verifier, type, duration)`
- `revoke_disclosure(verifier)`

**Off-Chain Actions:**
- Decrypt payment history locally
- Run RISC Zero guest program
- Generate STARK proof

### Verifier (Bank/Landlord)
- Request disclosure from employee
- Query income proofs (with authorization)
- Verify employee meets income requirements

**Contract Calls:**
- `verify_income_requirement(employee_id, type, threshold)`
- `verify_income_proof_for_disclosure(employee_id, index)`

**What Verifier Sees:**
- Proof type (threshold, range, average, credit)
- Threshold value
- Result (true/false)
- Verification timestamp

**What Verifier Never Sees:**
- Actual salary amounts
- Individual payment dates
- Payment history details

---

## Cross-Chain Integration

The system integrates with NEAR Intents protocol for cross-chain operations.

### Intents Adapter Contract

**Purpose**: Bridge between payroll system and external chains (Zcash, Ethereum, Solana, Bitcoin)

**Key Features**:
- Routes deposits from external chains to payroll contract
- Initiates cross-chain withdrawals via NEAR Intents
- Validates destination addresses for all supported chains
- Tracks pending deposits and withdrawals
- Configurable fees per chain

**Supported Chains**:
| Chain | Deposits | Withdrawals | Fee | Status |
|-------|----------|-------------|-----|--------|
| Zcash | ✅ | ✅ | 0.5% | Operational |
| NEAR  | ✅ | ✅ | 0% | Operational |
| Solana | ❌ | ✅ | 0.3% | Planned |
| Ethereum | ❌ | ✅ | 1.0% | Planned |
| Bitcoin | ❌ | ✅ | 0.5% | Planned |

### Bridge Relayer

**Purpose**: Automated service connecting Zcash network with NEAR Protocol

**Features**:
- Monitors Zcash blockchain for deposits to custody address
- Mints wZEC on NEAR when deposits are confirmed
- Executes Zcash withdrawals when requested via intents adapter
- Uses Zallet RPC (Zcash wallet with privacy policy support)
- State persistence for crash recovery
- Operation polling for async Zcash transactions

**Status**: ✅ Fully operational (deployed 2025-12-02)

**See**: `docs/cross-chain/CROSS_CHAIN_INTENTS.md` for detailed cross-chain architecture

---

## Data Flows

### 1. Employee Onboarding

```
Company                        Payroll Contract
   |                                |
   |  1. Generate key pair          |
   |  2. Compute salary commitment  |
   |  3. Encrypt employee data      |
   |                                |
   |  add_employee(...)             |
   |------------------------------->|
   |                                |
   |                                |  Store employee record
   |                                |  Store commitment
   |                                |  Initialize balance = 0
```

### 2. Payment Flow

```
Company          RISC Zero        Payroll         ZK Verifier
   |                |                |                |
   |  Generate      |                |                |
   |  payment proof |                |                |
   |--------------->|                |                |
   |                |                |                |
   |    Receipt     |                |                |
   |<---------------|                |                |
   |                |                |                |
   |  pay_employee(proof)            |                |
   |-------------------------------->|                |
   |                |                |                |
   |                |                |  verify_proof  |
   |                |                |--------------->|
   |                |                |                |
   |                |                |    valid       |
   |                |                |<---------------|
   |                |                |                |
   |                |                |  Update balance|
   |                |                |  Record payment|
```

### 3. Income Verification

```
Employee         RISC Zero        Payroll         Bank
   |                |                |                |
   |  Decrypt       |                |                |
   |  payment       |                |                |
   |  history       |                |                |
   |                |                |                |
   |  Generate      |                |                |
   |  income proof  |                |                |
   |--------------->|                |                |
   |                |                |                |
   |    Receipt     |                |                |
   |<---------------|                |                |
   |                |                |                |
   |  submit_income_proof(receipt)   |                |
   |-------------------------------->|                |
   |                |                |                |
   |  grant_disclosure(bank, 30days) |                |
   |-------------------------------->|                |
   |                |                |                |
   |                |                |  verify_income_requirement
   |                |                |<---------------|
   |                |                |                |
   |                |                |    true/false  |
   |                |                |--------------->|
```

---

## Privacy Model

### Private Data (On-Chain but Encrypted)

| Data | Encryption | Who Can Decrypt |
|------|------------|-----------------|
| Salary amount | Employee public key | Employee only |
| Payment amounts | Employee public key | Employee only |
| Employee name | Employee public key | Employee only |
| Payment history | Pedersen commitment | Nobody (for proofs) |

### Public Data (On-Chain)

| Data | Visibility | Purpose |
|------|------------|---------|
| Employee account ID | Public | Identification |
| Employment status | Public | Basic verification |
| Payment count | Public | Proof validation |
| Income proof results | Authorized only | Bank verification |
| Proof timestamps | Authorized only | Freshness check |

### Cryptographic Primitives

- **Pedersen Commitments**: `commitment = H(domain || value || blinding)` - Hides value while allowing proofs
- **RISC Zero STARKs**: Scalable Transparent ARguments of Knowledge, no trusted setup, post-quantum secure
- **SHA-256**: History commitment binding, receipt hashing, image ID computation
- **Asymmetric Encryption (NaCl/ECIES)**: Encrypt sensitive data to employee public key

---

## Security Model

### Trust Assumptions

| Component | Trust Level | Notes |
|-----------|-------------|-------|
| NEAR Protocol | Trustless | Consensus-based |
| Smart Contracts | Trustless | Deterministic execution |
| RISC Zero Proofs | Trustless | Mathematical guarantee |
| Bridge Relayer | Trusted (t-of-n) | Threshold signatures |
| Zcash Shielded | Trustless | zk-SNARKs |

### Attack Vectors & Mitigations

| Attack | Mitigation |
|--------|------------|
| Fake payment history | History commitment verified on-chain |
| Replay income proof | Track used receipts, expiration dates |
| Forge ZK proof | STARK verification (computationally infeasible) |
| Wrong circuit | Image ID checked against registered circuits |
| Unauthorized disclosure | Disclosure authorization checked per query |
| Bridge manipulation | Threshold signatures, timelocks, fraud proofs |

---

## Gas Costs (Estimated)

| Operation | Gas (TGas) | Notes |
|-----------|------------|-------|
| add_employee | ~5 | Storage writes |
| pay_employee | ~10-15 | Proof verification |
| withdraw | ~5 | Token transfer |
| verify_income_proof | ~20-30 | STARK verification |

---

## Proof Server

The proof server generates real STARK proofs using RISC Zero zkVM.

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ELF_DIR` | Path to circuit ELF binaries | `target/riscv32im-risc0-zkvm-elf/docker` |
| `DEV_MODE` | Enable mock proofs | `false` |
| `USE_BONSAI` | Use Bonsai API (faster) | `false` |
| `PORT` | Server port | `3000` |

### API Endpoints

- `GET /health` - Server health check
- `POST /api/v1/proof/generate` - Generate a ZK proof

### Example Request

```json
{
  "proof_type": "income_threshold",
  "params": {
    "payment_history": [5000, 5000, 5000],
    "threshold": 4000,
    "history_commitment": [0,0,...,0],
    "employee_id": "alice.near"
  }
}
```

---

## Deployment

```
NEAR Testnet/Mainnet:
+-- payroll.{network}.near
|   +-- Payroll Contract
|       +-- Owner: company.{network}.near
|       +-- wzec_token: wzec.{network}.near
|       +-- zk_verifier: verifier.{network}.near
|       +-- intents_adapter: intents.{network}.near
|
+-- intents.{network}.near
|   +-- Intents Adapter Contract
|       +-- Owner: payroll.{network}.near (or separate admin)
|       +-- Payroll: payroll.{network}.near
|       +-- wZEC Token: wzec.{network}.near
|       +-- Authorized Relayers: [relayer1.near, relayer2.near, ...]
|
+-- wzec.{network}.near
|   +-- wZEC Token Contract (NEP-141)
|       +-- Bridge Controller: intents.{network}.near
|
+-- verifier.{network}.near
    +-- ZK Verifier Contract
        +-- Image IDs: [income, payment, balance]

Off-Chain Services:
+-- RISC Zero Prover (Local or Bonsai)
+-- Proof Server (REST API)
+-- Bridge Relayer (Zcash ↔ NEAR)
|   +-- Zallet RPC Connection
|   +-- State Persistence (JSON)
|   +-- Deposit Monitor (polling)
|   +-- Withdrawal Executor (z_sendmany)
+-- SDK (@near-private-payroll/sdk)
    +-- Payroll SDK
    +-- Intents SDK
```
