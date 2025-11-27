# Privacy Analysis: NEAR Private Payroll

## Executive Summary

**Question: Are we providing Private Payments & Transactions?**

**Answer: PARTIAL - We provide privacy at the commitment/proof level, but NOT at the transaction level on NEAR.**

This document analyzes what privacy guarantees the system actually provides versus what may be implied by the name "Private Payroll."

---

## Privacy Model Breakdown

### ✅ What IS Private

#### 1. Salary Amount Commitments
- **Mechanism**: Pedersen commitments hide salary values
- **Code**: `contracts/payroll/src/lib.rs:285` - `salary_commitments: LookupMap<AccountId, [u8; 32]>`
- **Privacy Level**: Cryptographically binding but not revealing
- **Who can see actual amount**: Only employee (via decryption) or via ZK proof

#### 2. Payment History Details
- **Mechanism**: Encrypted amounts + commitments
- **Code**: `contracts/payroll/src/lib.rs:173-182` - `EncryptedPayment` struct
```rust
pub struct EncryptedPayment {
    pub timestamp: u64,
    pub encrypted_amount: Vec<u8>,  // Only employee can decrypt
    pub commitment: [u8; 32],       // Hides amount cryptographically
    pub period: String,
}
```
- **Privacy Level**: High - requires employee's private key to decrypt
- **Who can see actual amounts**: Only the employee

#### 3. Employee Personal Data
- **Mechanism**: Encrypted with employee's public key
- **Code**: `contracts/payroll/src/lib.rs:157-158`
```rust
pub encrypted_name: Vec<u8>,
pub encrypted_salary: Vec<u8>,
```
- **Privacy Level**: High - encrypted at rest
- **Who can decrypt**: Only the employee

#### 4. ZK Proof Internals
- **Mechanism**: RISC Zero circuits prove properties without revealing inputs
- **Privacy Level**: Mathematical - private inputs never exposed
- **Public outputs**: Only proof results (true/false), not the underlying amounts

#### 5. Zcash Bridge Transactions
- **Mechanism**: Shielded Zcash transactions on the Zcash blockchain
- **Code**: `contracts/wzec-token/src/lib.rs:6-10`
- **Privacy Level**: Full Zcash shielded pool privacy
- **Applies to**:
  - Company deposits ZEC → Bridge (shielded)
  - Employee withdrawals Bridge → ZEC (shielded)

---

### ❌ What is NOT Private (Public On-Chain)

#### 1. Employee Balances
- **Code**: `contracts/payroll/src/lib.rs:289, 996-998`
```rust
pub employee_balances: LookupMap<AccountId, u128>,

pub fn get_balance(&self, employee_id: AccountId) -> U128 {
    U128(self.employee_balances.get(&employee_id).unwrap_or(0))
}
```
- **Privacy Level**: PUBLIC - anyone can call `get_balance()`
- **Exposure**: Total withdrawable balance visible to all
- **Implication**: If Alice has 5000 wZEC balance, anyone can see this

#### 2. Company Balance
- **Code**: `contracts/payroll/src/lib.rs:305, 1000-1003`
```rust
pub company_balance: u128,

pub fn get_company_balance(&self) -> U128 {
    U128(self.company_balance)
}
```
- **Privacy Level**: PUBLIC
- **Exposure**: Total company funds visible

#### 3. wZEC Token Balances and Transfers
- **Mechanism**: Standard NEP-141 fungible token
- **Code**: `contracts/wzec-token/src/lib.rs:215` - Implements `FungibleTokenCore`
- **Privacy Level**: FULLY PUBLIC (NEP-141 standard)
- **What's visible**:
  - All wZEC balances: `ft_balance_of(account_id)` - public view
  - All transfers: `ft_transfer()` events logged on-chain
  - Total supply: `ft_total_supply()` - public
- **Implication**: Every wZEC movement on NEAR is transparent like any token

#### 4. Payment Counts
- **Code**: `contracts/payroll/src/lib.rs:988-993`
```rust
pub fn get_payment_count(&self, employee_id: AccountId) -> u64 {
    self.payment_history.get(&employee_id)
        .map(|h| h.len())
        .unwrap_or(0)
}
```
- **Privacy Level**: PUBLIC
- **Exposure**: Number of payments received (not amounts)

#### 5. Employee Accounts and Status
- **Code**: `contracts/payroll/src/lib.rs:983-985`
```rust
pub fn get_employee(&self, employee_id: AccountId) -> Option<Employee> {
    self.employees.get(&employee_id)
}
```
- **Privacy Level**: PARTIALLY PUBLIC
- **What's public**: Account ID, employment status, start date
- **What's private**: Encrypted name, encrypted salary

#### 6. Income Proof Results
- **Code**: `contracts/payroll/src/lib.rs:232-253` - `VerifiedIncomeProof`
- **Privacy Level**: Public to authorized verifiers only
- **What's visible**:
  - "Income >= $4000" → true/false
  - Threshold amount
  - Verification timestamp
- **What's hidden**: Actual payment amounts

---

## Transaction Privacy Analysis

### On NEAR Blockchain

```
Employee Withdraw Flow:
┌──────────────────────────────────────────────────────────┐
│  Alice calls: withdraw(5000 wZEC)                        │
│  ├─> Payroll.employee_balances[Alice] -= 5000   PUBLIC  │
│  └─> wZEC.ft_transfer(Alice, 5000)               PUBLIC  │
│                                                           │
│  Visible to everyone:                                     │
│  - Alice withdrew 5000 wZEC                              │
│  - Alice's new balance in payroll contract               │
│  - Alice's wZEC token balance increased                  │
└──────────────────────────────────────────────────────────┘
```

**Conclusion**: Value transfers on NEAR are NOT private.

### On Zcash Blockchain

```
Employee Zcash Withdrawal Flow:
┌──────────────────────────────────────────────────────────┐
│  Alice burns 5000 wZEC for Zcash withdrawal              │
│  ├─> wZEC.burn_for_zcash(5000, "zs1...")        PUBLIC  │
│  │    (NEAR transaction)                                 │
│  │                                                        │
│  └─> Bridge sends 5000 ZEC to zs1...             PRIVATE │
│       (Zcash shielded transaction)                       │
│                                                           │
│  Visible on NEAR:                                         │
│  - Alice burned 5000 wZEC                                │
│  - Destination: zs1abc... (shielded address)             │
│                                                           │
│  NOT visible on Zcash:                                    │
│  - Who received (shielded)                               │
│  - Amount received (shielded)                            │
└──────────────────────────────────────────────────────────┘
```

**Conclusion**: Only Zcash-side transactions are private, not NEAR-side.

---

## Privacy Guarantees by Use Case

### Use Case 1: Employee Receives Salary

**Private:**
- ✅ Exact salary amount (via commitment)
- ✅ Payment history amounts (encrypted)

**Public:**
- ❌ Employee's total balance (anyone can query)
- ❌ Number of payments received
- ❌ When payments occurred (timestamps)

**Privacy Score**: 🔒🔒🔓 Moderate - amounts hidden, but balances visible

---

### Use Case 2: Employee Proves Income to Bank

**Private:**
- ✅ Exact payment amounts (never revealed)
- ✅ Detailed payment history (only commitment)

**Public (to authorized bank only):**
- ❌ "Income >= $4000" result (true/false)
- ❌ Threshold value ($4000)

**Public (to everyone):**
- ❌ Employee granted disclosure to bank (on-chain event)

**Privacy Score**: 🔒🔒🔒🔓 Good - bank only learns threshold result, not amounts

---

### Use Case 3: Employee Withdraws to Personal Wallet

**On NEAR (PUBLIC):**
- ❌ Withdrawal amount (5000 wZEC)
- ❌ Source (payroll contract)
- ❌ Destination (employee's NEAR account)
- ❌ wZEC transfer transaction

**On Zcash (PRIVATE - if they bridge out):**
- ✅ Amount received (shielded)
- ✅ Recipient (shielded address)

**Privacy Score**:
- NEAR side: 🔓 None - fully transparent
- Zcash side: 🔒🔒🔒🔒 Full - shielded pool privacy

---

## Comparison with Other Systems

### vs. Traditional Payroll (Stripe, Gusto)
| Feature | Traditional | Our System |
|---------|-------------|------------|
| Salary amounts | Visible to company & provider | Hidden via commitments |
| Payment history | Visible to company & provider | Encrypted, employee only |
| Withdrawal amounts | Provider sees all | **PUBLIC on NEAR** |
| Income verification | Full disclosure required | ZK proof (partial disclosure) |

**Winner**: Our system for income verification, but NOT for payment privacy

---

### vs. Fully Private Systems (Zcash, Monero)
| Feature | Zcash/Monero | Our System |
|---------|--------------|------------|
| Transaction amounts | Fully hidden | **PUBLIC on NEAR** |
| Sender/recipient | Fully hidden | **PUBLIC on NEAR** |
| Balance privacy | Fully hidden | **PUBLIC on NEAR** |
| Income proofs | Not possible (too private!) | ✅ ZK proofs available |

**Winner**: Zcash/Monero for payment privacy, our system for selective disclosure

---

### vs. Midnight Network (Zcash company's zkSalaria model)
| Feature | zkSalaria | Our System |
|---------|-----------|------------|
| Salary privacy | Hidden | ✅ Hidden (commitments) |
| Payment privacy | Hidden | ❌ **Balances PUBLIC** |
| Proof verification | Trusted auditor | ✅ Trustless (RISC Zero) |
| Blockchain | Midnight | NEAR |

**Key Difference**: We're trustless but less private than zkSalaria on Midnight

---

## Privacy Leakage Vectors

### 1. Balance Watching
**Attack**: Observer monitors `get_balance(alice.near)` over time
**What they learn**:
- When Alice receives payments (balance increases)
- Approximate payment amounts (balance deltas)
- When Alice withdraws (balance decreases)

**Example**:
```
Week 1: get_balance(alice.near) = 5000 wZEC
Week 2: get_balance(alice.near) = 10000 wZEC  → Alice got ~5000 wZEC payment
Week 3: get_balance(alice.near) = 3000 wZEC   → Alice withdrew ~7000 wZEC
```

**Severity**: HIGH - effectively reveals payment amounts

---

### 2. wZEC Transfer Monitoring
**Attack**: Monitor all `ft_transfer` events for wZEC token
**What they learn**:
- All withdrawals from payroll contract
- All wZEC movements between accounts
- Exact amounts transferred

**Severity**: CRITICAL - complete transparency on NEAR

---

### 3. Company Balance Tracking
**Attack**: Monitor `get_company_balance()` over time
**What they learn**:
- When company deposits funds
- Total payroll expenditure per period
- Company's financial runway

**Severity**: MEDIUM - business intelligence leakage

---

### 4. Timing Analysis
**Attack**: Correlate payment timestamps with market events
**What they learn**:
- Payment schedules (weekly/biweekly/monthly)
- Company cash flow patterns

**Severity**: LOW - limited information gain

---

## Recommendations for Improving Privacy

### Short-term (Can implement now)

1. **Private Balance Tracking**
```rust
// Instead of plaintext balances:
pub employee_balances: LookupMap<AccountId, u128>,  // PUBLIC

// Use commitments:
pub employee_balance_commitments: LookupMap<AccountId, [u8; 32]>,  // PRIVATE
```

2. **Batch Withdrawals**
- Pool withdrawals to hide individual amounts
- Use mixing service pattern

3. **Homomorphic Balances**
- Update balances using homomorphic encryption
- Never expose plaintext amounts

### Medium-term (Requires protocol changes)

1. **Private wZEC Variant**
- Implement shielded NEP-141 standard
- Use zk-SNARKs for balance privacy on NEAR
- Similar to Zcash shielded pool but on NEAR

2. **Confidential Transactions**
- Range proofs for balance updates
- Pedersen commitment arithmetic for transfers

### Long-term (Requires new infrastructure)

1. **Migrate to Midnight/Aurora**
- Use privacy-first blockchain
- Full transaction privacy

2. **Layer 2 Privacy Solution**
- Rollup with private state
- Only settle commitments on NEAR

---

## Accurate Privacy Claims

### Current Claims (in README.md)
> "Private Salary Payments - Amounts hidden via Pedersen commitments"

**Accuracy**: ✅ ACCURATE - commitments do hide amounts

> "Zcash Integration - Use ZEC for private value transfer via wZEC bridge"

**Accuracy**: ⚠️ MISLEADING - wZEC transfers on NEAR are PUBLIC, only Zcash-side is private

> "Private Payments & Transactions"

**Accuracy**: ❌ INACCURATE - transactions on NEAR are public

---

### Recommended Claims

**What to say:**
- ✅ "Privacy-preserving income verification with ZK proofs"
- ✅ "Salary commitments hide exact amounts"
- ✅ "Selective disclosure to third parties"
- ✅ "Encrypted payment history"
- ✅ "Zcash bridge for private withdrawals"

**What NOT to say:**
- ❌ "Private payments" (implies transaction privacy)
- ❌ "Private transactions" (they're public on NEAR)
- ❌ "Anonymous payroll" (account IDs are visible)
- ❌ "Hidden balances" (balances are queryable)

---

## Conclusion

### The Privacy Spectrum

```
Fully Public          Our System           Fully Private
    ↓                     ↓                      ↓
┌─────────┐         ┌──────────┐          ┌──────────┐
│ Normal  │         │  NEAR    │          │  Zcash   │
│ Payroll │         │ Private  │          │ Shielded │
│         │         │ Payroll  │          │   Pool   │
│         │         │          │          │          │
│ - All   │         │ - Salary │          │ - All tx │
│   data  │         │   commit │          │   amounts│
│   public│         │ - Income │          │   hidden │
│         │         │   proofs │          │ - All    │
│         │         │ - BUT    │          │   balances
│         │         │   balances│         │   hidden │
│         │         │   PUBLIC │          │          │
└─────────┘         └──────────┘          └──────────┘
```

### Final Answer

**"Are we providing Private Payments & Transactions?"**

**NO**, we are providing:

1. ✅ **Private salary commitments** - cryptographically hidden amounts
2. ✅ **Private income proofs** - prove properties without revealing amounts
3. ✅ **Encrypted payment history** - only employee can decrypt
4. ✅ **Selective disclosure** - ZK proofs to authorized verifiers
5. ✅ **Private Zcash bridge** - shielded deposits/withdrawals on Zcash side

**BUT NOT:**

1. ❌ **Private transactions on NEAR** - all wZEC transfers are public
2. ❌ **Private balances on NEAR** - employee balances are publicly queryable
3. ❌ **Anonymous employees** - account IDs are visible
4. ❌ **Hidden payment timing** - timestamps and counts are public

### Core Value Proposition

This system excels at **privacy-preserving income verification**, allowing employees to prove income properties to banks/landlords without revealing exact amounts.

It does NOT provide transaction-level privacy on NEAR - for that, users must bridge to Zcash.

The privacy model is: **"Privacy through commitments and proofs, not through transaction shielding"**
