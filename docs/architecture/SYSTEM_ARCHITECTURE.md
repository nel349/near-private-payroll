# NEAR Private Payroll - System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│   │   Company    │    │   Employee   │    │   Verifier   │                 │
│   │   Admin      │    │              │    │  (Bank/etc)  │                 │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                 │
│          │                   │                   │                          │
└──────────┼───────────────────┼───────────────────┼──────────────────────────┘
           │                   │                   │
           │                   │                   │
┌──────────▼───────────────────▼───────────────────▼──────────────────────────┐
│                           SDK LAYER (TypeScript)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │  PayrollSDK     │  │  WZecSDK        │  │  VerifierSDK    │            │
│   │                 │  │                 │  │                 │            │
│   │ • addEmployee   │  │ • mint          │  │ • verifyProof   │            │
│   │ • payEmployee   │  │ • burn          │  │ • getImageId    │            │
│   │ • proveIncome   │  │ • transfer      │  │ • getStats      │            │
│   │ • withdraw      │  │                 │  │                 │            │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘            │
│            │                    │                    │                      │
└────────────┼────────────────────┼────────────────────┼──────────────────────┘
             │                    │                    │
             │   NEAR RPC Calls   │                    │
             │                    │                    │
┌────────────▼────────────────────▼────────────────────▼──────────────────────┐
│                        NEAR PROTOCOL (Smart Contracts)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │    Payroll      │  │     wZEC        │  │   ZK Verifier   │            │
│   │    Contract     │  │    Token        │  │    Contract     │            │
│   │                 │  │   (NEP-141)     │  │                 │            │
│   │ • employees     │  │                 │  │ • image_ids     │            │
│   │ • payments      │  │ • balances      │  │ • verify_*      │            │
│   │ • disclosures   │  │ • bridge_ctrl   │  │ • proof_types   │            │
│   │ • income_proofs │  │ • total_supply  │  │                 │            │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘            │
│            │                    │                    │                      │
│            └────────────────────┼────────────────────┘                      │
│                                 │                                           │
│                    Cross-contract calls                                     │
│                                                                              │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                         RISC ZERO LAYER (Off-Chain)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │  Payment Proof  │  │  Income Proof   │  │  Balance Proof  │            │
│   │    Circuit      │  │    Circuit      │  │    Circuit      │            │
│   │                 │  │                 │  │                 │            │
│   │ Private:        │  │ Private:        │  │ Private:        │            │
│   │ • salary        │  │ • payments[]    │  │ • balance       │            │
│   │ • blinding      │  │ • amounts[]     │  │ • blinding      │            │
│   │                 │  │                 │  │                 │            │
│   │ Public:         │  │ Public:         │  │ Public:         │            │
│   │ • commitment    │  │ • threshold     │  │ • commitment    │            │
│   │ • amounts_match │  │ • result        │  │ • sufficient    │            │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                              │
│                      Generates STARK proofs (receipts)                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                            ZCASH LAYER (Value Transfer)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Shielded Pool (Sapling/Orchard)                   │   │
│   │                                                                      │   │
│   │    Company Deposit ──→ Bridge Custody ──→ Employee Withdrawal       │   │
│   │    (shielded tx)       (threshold sig)    (shielded tx)             │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Actor Roles & Responsibilities

### Company Admin

```
┌─────────────────────────────────────────────────────────────┐
│                      COMPANY ADMIN                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Responsibilities:                                           │
│  ├─ Initialize payroll contract                             │
│  ├─ Deposit wZEC funds for payroll                          │
│  ├─ Add/manage employees                                    │
│  ├─ Process salary payments                                 │
│  ├─ Update employee status                                  │
│  └─ Register authorized auditors (for FullAudit only)       │
│                                                              │
│  Contract Calls:                                             │
│  • new(owner, wzec_token, zk_verifier)                      │
│  • ft_on_transfer(sender, amount, "deposit")                │
│  • add_employee(id, encrypted_name, encrypted_salary, ...)  │
│  • pay_employee(id, encrypted_amount, commitment, proof)    │
│  • update_employee_status(id, status)                       │
│  • register_authorized_auditor(auditor_id, license)         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Employee

```
┌─────────────────────────────────────────────────────────────┐
│                        EMPLOYEE                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Responsibilities:                                           │
│  ├─ Receive salary payments                                 │
│  ├─ Withdraw earned balance                                 │
│  ├─ Generate ZK income proofs (locally)                     │
│  ├─ Submit proofs to contract                               │
│  ├─ Grant/revoke disclosures to verifiers                   │
│  └─ Control who can see their income proofs                 │
│                                                              │
│  Contract Calls:                                             │
│  • withdraw(amount)                                         │
│  • submit_income_proof(type, threshold, receipt)            │
│  • grant_disclosure(verifier, type, duration)               │
│  • revoke_disclosure(verifier)                              │
│                                                              │
│  Off-Chain Actions:                                          │
│  • Decrypt payment history locally                          │
│  • Run RISC Zero guest program                              │
│  • Generate STARK proof (receipt)                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Verifier (Bank/Landlord)

```
┌─────────────────────────────────────────────────────────────┐
│                   VERIFIER (Bank/Landlord)                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Responsibilities:                                           │
│  ├─ Request disclosure from employee                        │
│  ├─ Query income proofs (with authorization)                │
│  ├─ Verify employee meets income requirements               │
│  └─ Make business decisions based on verified proofs        │
│                                                              │
│  Contract Calls (View Only):                                 │
│  • get_income_proof(employee_id)                            │
│  • verify_income_requirement(employee_id, type, threshold)  │
│  • verify_income_proof_for_disclosure(employee_id, index)   │
│                                                              │
│  What Verifier SEES:                                         │
│  ✓ Proof type (threshold, range, average, credit)           │
│  ✓ Threshold value ($X,XXX)                                 │
│  ✓ Result (true/false)                                      │
│  ✓ Verification timestamp                                   │
│  ✓ Expiration date                                          │
│                                                              │
│  What Verifier NEVER SEES:                                   │
│  ✗ Actual salary amounts                                    │
│  ✗ Individual payment dates                                 │
│  ✗ Payment history details                                  │
│  ✗ Other employees' data                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Auditor (Optional - Premium Service)

```
┌─────────────────────────────────────────────────────────────┐
│                   AUDITOR (Optional)                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  NOTE: Auditors are NOT required for basic income proofs!   │
│  RISC Zero provides trustless verification on-chain.        │
│                                                              │
│  Auditor services are OPTIONAL premium offerings:           │
│  ├─ Full financial audits (FullAudit disclosure)           │
│  ├─ Regulatory compliance verification                      │
│  ├─ Tax reporting attestations                              │
│  ├─ Multi-jurisdiction compliance                           │
│  ├─ Dispute resolution                                      │
│  └─ Enterprise integration consulting                       │
│                                                              │
│  When Used:                                                  │
│  • Employee grants FullAudit disclosure to auditor          │
│  • Auditor reviews complete encrypted records               │
│  • Auditor issues compliance attestation (off-chain)        │
│  • Attestation used for regulatory/legal purposes           │
│                                                              │
│  NOT Used For:                                               │
│  ✗ Basic income proofs (trustless via RISC Zero)           │
│  ✗ Threshold verifications                                  │
│  ✗ Range proofs                                             │
│  ✗ Credit score proofs                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Flow 1: Company Payroll Operations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPANY PAYROLL OPERATIONS                                │
└─────────────────────────────────────────────────────────────────────────────┘

  Company                  Payroll Contract              wZEC Token
     │                           │                           │
     │  1. Deposit funds         │                           │
     │  ft_transfer_call()       │                           │
     │──────────────────────────────────────────────────────>│
     │                           │                           │
     │                           │  2. ft_on_transfer()      │
     │                           │<──────────────────────────│
     │                           │                           │
     │                           │  company_balance += amt   │
     │                           │                           │
     │  3. Add employee          │                           │
     │  add_employee()           │                           │
     │──────────────────────────>│                           │
     │                           │                           │
     │                           │  Store: Employee record   │
     │                           │  Store: Salary commitment │
     │                           │  Init: Payment history    │
     │                           │                           │
     │  4. Pay employee          │                           │
     │  pay_employee()           │                           │
     │──────────────────────────>│                           │
     │                           │                           │
     │                           │  Verify ZK proof          │
     │                           │  Store: Payment record    │
     │                           │  Update: Employee balance │
     │                           │  Deduct: Company balance  │
     │                           │                           │
```

### Flow 2: Employee Income Proof (Trustless)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 EMPLOYEE INCOME PROOF (TRUSTLESS)                            │
└─────────────────────────────────────────────────────────────────────────────┘

  Employee              RISC Zero            Payroll           ZK Verifier
     │                  (Local)              Contract           Contract
     │                     │                    │                   │
     │  1. Fetch encrypted │                    │                   │
     │     payment history │                    │                   │
     │────────────────────────────────────────>│                   │
     │                     │                    │                   │
     │  2. Decrypt locally │                    │                   │
     │     with private key│                    │                   │
     │<────────────────────│                    │                   │
     │                     │                    │                   │
     │  3. Generate proof  │                    │                   │
     │     Private: amounts│                    │                   │
     │     Public: threshold                    │                   │
     │────────────────────>│                    │                   │
     │                     │                    │                   │
     │  4. STARK receipt   │                    │                   │
     │<────────────────────│                    │                   │
     │                     │                    │                   │
     │  5. Submit proof    │                    │                   │
     │     submit_income_proof()                │                   │
     │────────────────────────────────────────>│                   │
     │                     │                    │                   │
     │                     │                    │  6. Verify        │
     │                     │                    │     receipt       │
     │                     │                    │──────────────────>│
     │                     │                    │                   │
     │                     │                    │  7. Return result │
     │                     │                    │<──────────────────│
     │                     │                    │                   │
     │                     │                    │  8. Store proof   │
     │                     │                    │     record        │
     │                     │                    │                   │
     │  9. Success         │                    │                   │
     │<────────────────────────────────────────│                   │
     │                     │                    │                   │

  NO AUDITOR INVOLVED - PURE CRYPTOGRAPHIC VERIFICATION
```

### Flow 3: Bank Verifies Income

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BANK VERIFIES INCOME                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  Employee              Bank               Payroll Contract
     │                   │                        │
     │  1. Request loan  │                        │
     │──────────────────>│                        │
     │                   │                        │
     │  2. Grant disclosure                       │
     │     grant_disclosure(bank, type, 30 days)  │
     │───────────────────────────────────────────>│
     │                   │                        │
     │  3. Notify bank   │                        │
     │     "I authorized │                        │
     │      your access" │                        │
     │──────────────────>│                        │
     │                   │                        │
     │                   │  4. Query proof        │
     │                   │     verify_income_requirement()
     │                   │───────────────────────>│
     │                   │                        │
     │                   │                        │  Check:
     │                   │                        │  ✓ Bank authorized?
     │                   │                        │  ✓ Proof exists?
     │                   │                        │  ✓ Not expired?
     │                   │                        │  ✓ Meets threshold?
     │                   │                        │
     │                   │  5. Return: true/false │
     │                   │<───────────────────────│
     │                   │                        │
     │  6. Loan decision │                        │
     │<──────────────────│                        │
     │                   │                        │
     │   APPROVED!       │                        │
     │   (Bank never saw │                        │
     │    actual salary) │                        │
     │                   │                        │
```

---

## Privacy Model

### What's Private (On-Chain but Encrypted)

| Data | Encryption | Who Can Decrypt |
|------|------------|-----------------|
| Salary amount | Employee public key | Employee only |
| Payment amounts | Employee public key | Employee only |
| Employee name | Employee public key | Employee only |
| Payment history | Pedersen commitment | Nobody (used for proofs) |

### What's Public (On-Chain)

| Data | Visibility | Purpose |
|------|------------|---------|
| Employee account ID | Public | Identification |
| Employment status | Public | Basic verification |
| Payment count | Public | Proof validation |
| Income proof results | Authorized only | Bank/landlord verification |
| Proof timestamps | Authorized only | Freshness check |

### Cryptographic Primitives

```
┌─────────────────────────────────────────────────────────────┐
│                  CRYPTOGRAPHIC PRIMITIVES                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Pedersen Commitments:                                       │
│  ├─ commitment = H(domain || value || blinding)             │
│  ├─ Hides value while allowing proofs                       │
│  └─ Used for: salary, payment amounts                       │
│                                                              │
│  RISC Zero STARKs:                                           │
│  ├─ Scalable Transparent ARguments of Knowledge             │
│  ├─ No trusted setup required                               │
│  ├─ Post-quantum secure                                     │
│  └─ Verifiable on any blockchain                            │
│                                                              │
│  SHA-256 Hashing:                                            │
│  ├─ History commitment binding                              │
│  ├─ Receipt hashing                                         │
│  └─ Image ID computation                                    │
│                                                              │
│  Asymmetric Encryption (NaCl/ECIES):                        │
│  ├─ Employee public/private key pairs                       │
│  ├─ Encrypt sensitive data to employee                      │
│  └─ Only employee can decrypt                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Model

### Trust Assumptions

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUST ASSUMPTIONS                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  TRUSTLESS (Cryptographic Guarantee):                        │
│  ✓ Income proof verification (RISC Zero STARKs)             │
│  ✓ Payment commitment binding                               │
│  ✓ History commitment integrity                             │
│  ✓ Replay attack prevention                                 │
│                                                              │
│  TRUST REQUIRED:                                             │
│  • NEAR validators (blockchain consensus)                   │
│  • RISC Zero circuit correctness (audited code)             │
│  • Company to pay correctly (but proofs verify)             │
│  • Bridge operators (for Zcash transfers)                   │
│                                                              │
│  NO LONGER REQUIRED (vs zkSalaria):                         │
│  ✗ Trusted auditor for proof verification                   │
│  ✗ Attestation signatures                                   │
│  ✗ Auditor reputation system                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

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

## Contract Interactions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONTRACT INTERACTIONS                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │    Company      │
                    │    (Owner)      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   Payroll   │  │    wZEC     │  │ ZK Verifier │
    │  Contract   │  │   Token     │  │  Contract   │
    │             │  │             │  │             │
    │ employees   │  │ balances    │  │ image_ids   │
    │ payments    │  │ allowances  │  │ verifications│
    │ disclosures │  │ total_supply│  │ proof_types │
    │ income_proofs│ │             │  │             │
    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
           │                │                │
           │  Cross-contract calls:          │
           │                │                │
           │  ft_transfer() │                │
           │───────────────>│                │
           │                │                │
           │  verify_*()                     │
           │────────────────────────────────>│
           │                                 │
           │<────────────────────────────────│
           │  (verification result)          │
           │                                 │

```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────┘

NEAR Testnet/Mainnet:
├── payroll.{network}.near
│   └── Payroll Contract
│       ├── Owner: company.{network}.near
│       ├── wzec_token: wzec.{network}.near
│       └── zk_verifier: verifier.{network}.near
│
├── wzec.{network}.near
│   └── wZEC Token Contract
│       ├── Owner: bridge.{network}.near
│       └── Bridge Controller: bridge.{network}.near
│
├── verifier.{network}.near
│   └── ZK Verifier Contract
│       ├── Owner: admin.{network}.near
│       └── Image IDs: [payment, income, balance]
│
└── bridge.{network}.near
    └── Bridge Relayer (Future)
        ├── Zcash Integration
        └── Threshold Signatures

Off-Chain Infrastructure:
├── RISC Zero Prover (Employee Local)
│   └── Guest Programs: payment, income, balance
│
├── SDK Distribution (npm)
│   └── @near-private-payroll/sdk
│
└── Frontend (Future)
    └── Web Application
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2025-11 | Initial contracts with placeholder verification |
| 0.2.0 | TBD | Trustless architecture with real RISC Zero |
| 1.0.0 | TBD | Production release with full features |
