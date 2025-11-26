# Proof Server Architecture

## Overview

This document outlines the architecture for decentralized ZK proof generation, from hackathon MVP to mainnet deployment.

## The Challenge

ZK proofs require significant computation. Users have three options:

| Option | Privacy | Convenience | Trust |
|--------|---------|-------------|-------|
| Local proving | Full | Low (heavy computation) | None required |
| Hosted proof server | None | High | Full trust in operator |
| TEE-based proof server | Full | High | Trust in hardware only |

**Goal:** Combine convenience of hosted proving with privacy of local proving using TEE.

---

## Architecture Phases

### Phase 1: Hackathon MVP

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1: HACKATHON                          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐       ┌──────────────────────┐       ┌──────────────┐
│   Frontend   │──────>│   Proof Server       │──────>│    NEAR      │
│   (Web App)  │       │   (Your infra)       │       │   Testnet    │
│              │       │                      │       │              │
│  • Chat UI   │       │  • RISC Zero prover  │       │  • payroll   │
│  • Wallet    │       │  • REST API          │       │  • verifier  │
└──────────────┘       │  • Centralized       │       │  • wZEC      │
                       └──────────────────────┘       └──────────────┘

Trust Model: Users trust the proof server operator (you)
Privacy: Limited (operator can see inputs)
Purpose: Demo functionality, win hackathon
```

**Components:**
- Single proof server instance
- REST API for proof requests
- No authentication required
- Free usage (subsidized for demo)

---

### Phase 1.5: Local TEE Proving (Privacy Option)

```
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 1.5: LOCAL TEE PROVING                       │
└─────────────────────────────────────────────────────────────────┘

User's Machine (with TEE support):
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              TEE Enclave (SGX/TDX)                      │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │  Proof Server Binary                            │   │    │
│  │  │  ─────────────────────                          │   │    │
│  │  │  • Decrypts user's payment data                 │   │    │
│  │  │  • Runs RISC Zero prover                        │   │    │
│  │  │  • Generates ZK proof                           │   │    │
│  │  │  • Data NEVER leaves enclave                    │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                                                         │    │
│  │  Attestation: Cryptographic proof that code is running │    │
│  │               in genuine TEE, unmodified               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Output: ZK proof only (private data stays in enclave)          │
└─────────────────────────────────────────────────────────────────┘

Trust Model: Trust Intel/AMD hardware attestation
Privacy: Full (even local malware can't access enclave data)
Purpose: Privacy-conscious users, production use
```

**TEE Attestation Flow:**

```
1. User downloads proof-server binary
2. Binary launches in TEE enclave
3. TEE generates attestation report:
   - Hash of running code
   - Hardware signature from CPU
   - Proof that enclave is genuine
4. User can verify attestation before sending data
5. Data sent to enclave, processed, proof returned
6. Data destroyed when enclave closes
```

**Supported TEE Platforms:**

| Platform | Hardware | Availability |
|----------|----------|--------------|
| Intel SGX | Intel CPUs (various) | Widely available |
| Intel TDX | Intel 4th gen Xeon+ | Cloud providers |
| AMD SEV | AMD EPYC | Cloud providers |
| ARM TrustZone | ARM chips | Mobile devices |

---

### Phase 2: Testnet (Semi-Decentralized)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 2: TESTNET                             │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────┐
                    │   Prover Registry       │
                    │   (NEAR Contract)       │
                    │   ────────────────      │
                    │   • Registered provers  │
                    │   • TEE attestations    │
                    │   • Reputation scores   │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  Prover A     │       │  Prover B     │       │  Prover C     │
│  (Your infra) │       │  (Partner)    │       │  (Community)  │
│  ───────────  │       │  ───────────  │       │  ───────────  │
│  TEE: SGX     │       │  TEE: TDX     │       │  TEE: SEV     │
│  Stake: 1000  │       │  Stake: 500   │       │  Stake: 2000  │
│  Rep: 98%     │       │  Rep: 95%     │       │  Rep: 99%     │
└───────────────┘       └───────────────┘       └───────────────┘

Trust Model: Trust TEE attestation + economic incentives
Privacy: Full (all provers run in TEE)
Purpose: Test decentralization, gather metrics
```

**Requirements for Provers:**
- Valid TEE attestation (verified on-chain or via oracle)
- Minimum stake deposit
- SLA commitment (uptime, response time)

---

### Phase 3: Mainnet (Fully Decentralized)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 3: MAINNET                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Prover Network                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Prover Registry Contract                               │   │
│  │  ────────────────────────                               │   │
│  │  • Open registration (stake + TEE attestation)          │   │
│  │  • Automatic prover selection (random + reputation)     │   │
│  │  • Fee distribution                                     │   │
│  │  • Slashing for misbehavior                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐  │
│  │  Prover 1   │ │  Prover 2   │ │  Prover 3   │ │  ...     │  │
│  │  TEE ✓      │ │  TEE ✓      │ │  TEE ✓      │ │  TEE ✓   │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └──────────┘  │
│                                                                 │
│  Alternative: Local TEE Proving (always available)             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Users can run proof-server locally in TEE              │   │
│  │  • Incentivized with fee rebates                        │   │
│  │  • Maximum privacy guarantee                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Economics

### Fee Structure

```
Proof Generation Fee Breakdown:
───────────────────────────────

User pays: 0.1 NEAR per proof
           │
           ├── 70% → Prover (0.07 NEAR)
           │         Covers compute + profit
           │
           ├── 20% → Protocol Treasury (0.02 NEAR)
           │         Development, audits, grants
           │
           └── 10% → Insurance Pool (0.01 NEAR)
                     Covers slashing events
```

### Prover Economics

```
Prover Revenue Model:
─────────────────────

Revenue:
• Proof fees: ~0.07 NEAR per proof
• Volume bonus: +10% for top 10 provers by volume
• Uptime bonus: +5% for 99.9% uptime

Costs:
• Hardware: TEE-capable server (~$500-2000/month)
• Stake: Minimum 1000 NEAR locked
• Operations: Monitoring, updates

Break-even: ~1000 proofs/day at 0.07 NEAR = 70 NEAR/day = ~$100/day
```

### Staking & Slashing

```
Prover Registration:
────────────────────

To become a prover:
1. Stake minimum 1000 NEAR
2. Submit TEE attestation
3. Pass verification period (100 successful proofs)
4. Appear in prover registry

Slashing conditions:
• Invalid proof submitted: 10% stake slashed
• Downtime > 1 hour: 1% stake slashed
• Data leak (if detectable): 100% stake slashed + ban
• Attestation forgery: 100% stake slashed + ban
```

### Local Proving Incentives

```
Incentivize Privacy-Preserving Behavior:
────────────────────────────────────────

User generates proof locally (in TEE):
• No proof fee required (0 NEAR)
• Only pays gas for on-chain verification
• Earns "privacy score" (future benefits)

Why this works:
• Reduces load on prover network
• Maximum privacy for user
• Cost savings passed to user
```

---

## Technical Implementation

### Proof Server API

```
REST API Endpoints:
───────────────────

POST /v1/prove/income-threshold
{
  "payment_history": [...],      // Encrypted with enclave public key
  "threshold": 50000,
  "history_commitment": "0x..."
}

Response:
{
  "proof": "0x...",              // Groth16 proof (256 bytes)
  "public_outputs": {
    "meets_threshold": true,
    "payment_count": 6
  },
  "attestation": "0x..."         // TEE attestation of this proof
}

GET /v1/attestation
Response: Current TEE attestation report

GET /v1/health
Response: Server status, queue length, estimated wait time
```

### TEE Attestation Verification

```rust
// On-chain verification (simplified)
pub fn verify_tee_attestation(
    attestation: &[u8],
    expected_code_hash: [u8; 32],  // Hash of proof-server binary
) -> bool {
    // 1. Verify Intel/AMD signature on attestation
    let sig_valid = verify_attestation_signature(attestation);

    // 2. Extract code measurement from attestation
    let measured_hash = extract_code_hash(attestation);

    // 3. Verify running code matches expected
    let code_valid = measured_hash == expected_code_hash;

    sig_valid && code_valid
}
```

### Prover Registry Contract

```rust
// Contract state
pub struct ProverRegistry {
    provers: UnorderedMap<AccountId, ProverInfo>,
    minimum_stake: u128,
    approved_code_hashes: UnorderedSet<[u8; 32]>,  // Valid proof-server versions
}

pub struct ProverInfo {
    stake: u128,
    tee_attestation: Vec<u8>,
    attestation_expiry: u64,
    reputation: u32,           // 0-10000 (basis points)
    total_proofs: u64,
    successful_proofs: u64,
    registered_at: u64,
}

// Key functions
impl ProverRegistry {
    pub fn register_prover(&mut self, attestation: Vec<u8>) { ... }
    pub fn update_attestation(&mut self, attestation: Vec<u8>) { ... }
    pub fn select_prover(&self) -> AccountId { ... }  // Random weighted by reputation
    pub fn report_success(&mut self, prover: AccountId) { ... }
    pub fn report_failure(&mut self, prover: AccountId, evidence: Vec<u8>) { ... }
    pub fn slash(&mut self, prover: AccountId, amount: u128, reason: String) { ... }
    pub fn withdraw_stake(&mut self) { ... }  // With timelock
}
```

---

## Implementation Roadmap

### Phase 1: Hackathon (Current Sprint)

- [ ] Build proof-server binary (RISC Zero prover + HTTP API)
- [ ] Deploy single instance on cloud
- [ ] Integrate with frontend
- [ ] Basic monitoring/logging

### Phase 1.5: Local TEE (Post-Hackathon)

- [ ] Add TEE support to proof-server (Intel SGX SDK)
- [ ] Implement attestation generation
- [ ] Build attestation verification (client-side)
- [ ] Package for local installation (Docker + SGX)
- [ ] Documentation for running locally

### Phase 2: Testnet Decentralization

- [ ] Deploy ProverRegistry contract
- [ ] On-chain attestation verification (or oracle-based)
- [ ] Prover selection algorithm
- [ ] Basic reputation system
- [ ] Fee collection and distribution
- [ ] 3-5 initial provers (partners)

### Phase 3: Mainnet

- [ ] Open prover registration
- [ ] Advanced reputation (ML-based?)
- [ ] Slashing mechanism
- [ ] Insurance pool
- [ ] Governance for parameters
- [ ] Security audit

---

## Security Considerations

### TEE Limitations

```
What TEE protects against:
✓ Malicious server operator viewing data
✓ Other processes on same machine
✓ Memory dumps / cold boot attacks
✓ Most software-based attacks

What TEE does NOT protect against:
✗ Hardware attacks (side-channels, fault injection)
✗ Bugs in enclave code itself
✗ Intel/AMD being compromised
✗ Some speculative execution attacks (Spectre variants)
```

### Mitigation Strategies

1. **Defense in depth**: TEE + encryption + minimal data exposure
2. **Code audits**: Enclave code must be audited
3. **Bug bounties**: Reward vulnerability disclosure
4. **Attestation freshness**: Require recent attestations
5. **Diversity**: Support multiple TEE platforms (SGX, TDX, SEV)

---

## References

- [Intel SGX Documentation](https://www.intel.com/content/www/us/en/developer/tools/software-guard-extensions/overview.html)
- [RISC Zero Documentation](https://dev.risczero.com/)
- [Gramine (SGX LibOS)](https://gramine.readthedocs.io/)
- [Midnight Proof Server](https://docs.midnight.network/)
