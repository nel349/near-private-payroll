# NEAR Private Payroll - Architecture Overview

## System Components

### 1. NEAR Smart Contracts

```
┌─────────────────────────────────────────────────────────────┐
│                    NEAR Protocol Layer                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐                                        │
│  │   Payroll       │  Core payroll logic:                   │
│  │   Contract      │  • Employee CRUD                       │
│  │                 │  • Payment processing                  │
│  │                 │  • Balance management                  │
│  │                 │  • Disclosure control                  │
│  │                 │  • Income proof storage                │
│  └────────┬────────┘                                        │
│           │                                                  │
│           │ ft_transfer_call                                │
│           ▼                                                  │
│  ┌─────────────────┐                                        │
│  │   wZEC Token    │  Value layer:                          │
│  │   (NEP-141)     │  • Mint on Zcash deposit               │
│  │                 │  • Burn for Zcash withdrawal           │
│  │                 │  • Standard FT operations              │
│  └────────┬────────┘                                        │
│           │                                                  │
│           │ verify_*                                        │
│           ▼                                                  │
│  ┌─────────────────┐                                        │
│  │   ZK Verifier   │  Proof verification:                   │
│  │   Contract      │  • RISC Zero receipt validation        │
│  │                 │  • Image ID management                 │
│  │                 │  • Verification history                │
│  └─────────────────┘                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2. RISC Zero Circuits

```
┌─────────────────────────────────────────────────────────────┐
│                    RISC Zero zkVM                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Payment Proof Circuit                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Private Inputs:                                        ││
│  │    • salary: u64                                        ││
│  │    • salary_blinding: [u8; 32]                          ││
│  │    • payment_amount: u64                                ││
│  │    • payment_blinding: [u8; 32]                         ││
│  │                                                         ││
│  │  Public Outputs (Journal):                              ││
│  │    • salary_commitment: [u8; 32]                        ││
│  │    • payment_commitment: [u8; 32]                       ││
│  │    • amounts_match: bool                                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Income Proof Circuit                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Private Inputs:                                        ││
│  │    • payment_history: Vec<u64>                          ││
│  │    • (varies by proof type)                             ││
│  │                                                         ││
│  │  Public Outputs (Journal):                              ││
│  │    • threshold/range parameters                         ││
│  │    • result: bool                                       ││
│  │    • payment_count: u32                                 ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3. Bridge Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Bridge Layer                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐         ┌─────────────────┐            │
│  │   Zcash Node    │◄───────►│  Bridge Relayer │            │
│  │                 │         │                 │            │
│  │  • Shielded     │         │  • Watch Zcash  │            │
│  │    transactions │         │  • Watch NEAR   │            │
│  │  • Note         │         │  • Mint wZEC    │            │
│  │    scanning     │         │  • Send ZEC     │            │
│  └─────────────────┘         └────────┬────────┘            │
│                                       │                      │
│                              ┌────────▼────────┐            │
│                              │  Threshold      │            │
│                              │  Signature      │            │
│                              │  (t-of-n)       │            │
│                              └─────────────────┘            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Employee Onboarding

```
Company                        Payroll Contract
   │                                │
   │  1. Generate key pair          │
   │  2. Compute salary commitment  │
   │  3. Encrypt employee data      │
   │                                │
   │  add_employee(                 │
   │    employee_id,                │
   │    encrypted_name,             │
   │    encrypted_salary,           │
   │    salary_commitment,          │
   │    public_key                  │
   │  )                             │
   │ ──────────────────────────────►│
   │                                │
   │                                │  Store employee record
   │                                │  Store commitment
   │                                │  Initialize balance = 0
```

### Payment Flow

```
Company          RISC Zero        Payroll         ZK Verifier
   │                │                │                │
   │  Generate      │                │                │
   │  payment proof │                │                │
   │ ──────────────►│                │                │
   │                │                │                │
   │    Receipt     │                │                │
   │◄───────────────│                │                │
   │                │                │                │
   │  pay_employee(proof)            │                │
   │ ───────────────────────────────►│                │
   │                │                │                │
   │                │                │  verify_proof  │
   │                │                │ ──────────────►│
   │                │                │                │
   │                │                │    valid       │
   │                │                │◄───────────────│
   │                │                │                │
   │                │                │  Update balance│
   │                │                │  Record payment│
```

### Income Verification Flow

```
Employee         RISC Zero        Payroll         Bank (Verifier)
   │                │                │                │
   │  Decrypt       │                │                │
   │  payment       │                │                │
   │  history       │                │                │
   │  locally       │                │                │
   │                │                │                │
   │  Generate      │                │                │
   │  income proof  │                │                │
   │ ──────────────►│                │                │
   │                │                │                │
   │    Receipt     │                │                │
   │◄───────────────│                │                │
   │                │                │                │
   │  submit_income_proof(receipt)   │                │
   │ ───────────────────────────────►│                │
   │                │                │                │
   │  grant_disclosure(bank, 30days) │                │
   │ ───────────────────────────────►│                │
   │                │                │                │
   │                │                │  verify_disclosure
   │                │                │◄───────────────│
   │                │                │                │
   │                │                │    result      │
   │                │                │ ──────────────►│
```

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

1. **Bridge Compromise**
   - Mitigation: Threshold signatures (5-of-9)
   - Mitigation: Timelocks on large withdrawals
   - Mitigation: Insurance fund

2. **Front-running**
   - Mitigation: Commitment scheme (amounts hidden)
   - Mitigation: Private mempool (future)

3. **Replay Attacks**
   - Mitigation: Nonces on withdrawals
   - Mitigation: Unique proof commitments

## Gas Costs (Estimated)

| Operation | Gas (TGas) | Notes |
|-----------|------------|-------|
| add_employee | ~5 | Storage writes |
| pay_employee | ~10-15 | Proof verification |
| withdraw | ~5 | Token transfer |
| verify_income_proof | ~20-30 | STARK verification |

## Scalability

### Current Limitations
- Single payroll contract per company
- Sequential payment processing
- On-chain storage of all payments

### Future Improvements
- Batch payments with aggregated proofs
- Off-chain payment history (IPFS/Arweave)
- Sharded employee data
