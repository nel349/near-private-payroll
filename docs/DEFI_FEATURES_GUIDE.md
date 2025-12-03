# NEAR Private Payroll - DeFi Features Guide

**Version:** 1.0
**Date:** December 2, 2025
**Status:** Production Ready (Mainnet Only)

## Overview

NEAR Private Payroll now integrates with **NEAR Intents Protocol** (`intents.near`) to enable employees to access DeFi features directly from their salary payments. This allows Zcash holders to:

1. **Cross-Chain Swap** - Convert ZEC to other assets on different blockchains
2. **Auto-Lend** - Automatically deposit a percentage of salary into lending protocols to earn yield

These features are powered by the NEAR Intents protocol, which provides cross-chain interoperability and connects to major DeFi protocols like Aave, Compound, and Solend.

## ⚠️ Important: Mainnet Only

**NEAR Intents (`intents.near`) only exists on mainnet.** These DeFi features cannot be fully tested on testnet. The contract logic has been tested in sandbox environments, but real cross-chain operations require mainnet deployment.

---

## Feature 1: Cross-Chain Swap

### What It Does

Employees can swap their wZEC balance to other assets on different blockchains instantly. For example:
- Swap ZEC → USDC on Ethereum
- Swap ZEC → SOL on Solana
- Swap ZEC → BTC on Bitcoin

### How It Works

1. Employee calls `swap_balance()` with:
   - Amount of ZEC to swap
   - Target asset (e.g., `nep141:usdc.token.near`)
   - Target chain (Ethereum, Solana, Bitcoin)
   - Minimum output (slippage protection)
   - Optional recipient address

2. Contract transfers wZEC to NEAR Intents protocol via PoA Bridge
3. NEAR Intents executes cross-chain swap
4. Recipient receives assets on target chain

### Benefits

- **No manual bridge required** - Direct swaps from NEAR
- **Slippage protection** - Set minimum output amount
- **Multi-chain support** - Access assets on any supported chain
- **Privacy** - On-chain only sees wZEC transfers, not salary details

### Example Use Cases

**Use Case 1: Employee wants to pay rent in USDC on Ethereum**
```
1. Receive 1 ZEC salary (~$3000)
2. Swap 1 ZEC → 2800 USDC (with 2% slippage protection)
3. Receive USDC in Ethereum wallet
4. Pay rent directly from Ethereum
```

**Use Case 2: Employee wants to diversify holdings**
```
1. Receive 2 ZEC salary
2. Keep 1 ZEC in wallet (privacy)
3. Swap 0.5 ZEC → SOL on Solana (for DeFi)
4. Swap 0.5 ZEC → BTC on Bitcoin (store of value)
```

### SDK Usage

```typescript
import { PrivatePayroll, DestinationChain } from '@near-private-payroll/sdk';

// Initialize SDK
const payroll = new PrivatePayroll(nearAccount, 'payroll.near');

// Swap 1 ZEC to USDC on Ethereum
await payroll.swapBalance(
  '100000000',              // 1 ZEC (8 decimals)
  'nep141:usdc.token.near', // Target asset
  DestinationChain.Ethereum,
  '2800000000',             // Min 2800 USDC (6 decimals)
  null                      // Recipient = caller
);
```

### Configuration Requirements

**Owner must configure:**
```typescript
// Set PoA Bridge token for Zcash
await payroll.setPoAToken('zec.omft.near');

// Set NEAR Intents contract
await payroll.setNearIntentsContract('intents.near');
```

### Gas and Deposits

- **Gas:** 300 TGas (cross-chain operations are expensive)
- **Deposit:** 1 yoctoNEAR (required for cross-contract calls)

---

## Feature 2: Auto-Lend

### What It Does

Employees can configure automatic lending of a percentage of their salary to DeFi protocols. This allows them to earn passive yield on assets they don't need immediately.

### How It Works

1. Employee enables auto-lend with configuration:
   - Percentage of salary (1-100%)
   - Target protocol (Aave, Compound, Solend)
   - Target chain (Ethereum, Solana, etc.)
   - Target asset (USDC, DAI, etc.)

2. On each payment, contract automatically:
   - Calculates lend amount: `lend_amount = salary * percentage / 100`
   - Credits remaining to employee balance
   - Deposits lend amount into lending protocol
   - Tracks lent balance separately

3. Employee can withdraw from lending anytime

### Benefits

- **Passive yield** - Earn interest automatically
- **Flexible** - Adjust percentage or disable anytime
- **Transparent** - Track lent balance separately
- **Privacy-preserving** - Contract handles conversions internally

### Example Use Cases

**Use Case 1: Build emergency fund while earning yield**
```
Configuration:
- Percentage: 30%
- Protocol: Aave
- Chain: Ethereum
- Asset: USDC

Monthly Flow:
1. Receive 3 ZEC salary (~$9000)
2. Auto-lend 0.9 ZEC → ~$2700 USDC to Aave
3. Available balance: 2.1 ZEC (~$6300)
4. Aave USDC earns 5% APY
5. After 12 months: ~$32,400 + ~$1620 interest
```

**Use Case 2: DCA into yield farming**
```
Configuration:
- Percentage: 50%
- Protocol: Solend
- Chain: Solana
- Asset: USDC

Benefits:
- Dollar-cost averaging into DeFi
- Earn higher yields on Solana
- Build position gradually
- Lower gas fees than Ethereum
```

### SDK Usage

**Enable Auto-Lend:**
```typescript
import { PrivatePayroll, DestinationChain } from '@near-private-payroll/sdk';

const payroll = new PrivatePayroll(nearAccount, 'payroll.near');

// Enable: 30% to Aave on Ethereum as USDC
await payroll.enableAutoLend(
  30,                       // 30% of each payment
  'aave',                   // Aave protocol
  DestinationChain.Ethereum,
  'nep141:usdc.token.near'  // Lend as USDC
);
```

**Check Configuration:**
```typescript
const config = await payroll.getAutoLendConfig(employeeId);
console.log(config);
// {
//   enabled: true,
//   percentage: 30,
//   target_protocol: 'aave',
//   target_chain: 'Ethereum',
//   target_asset: 'nep141:usdc.token.near'
// }
```

**Check Lent Balance:**
```typescript
const lentBalance = await payroll.getLentBalance(employeeId);
console.log(`Lent: ${lentBalance} ZEC`);
```

**Withdraw from Lending:**
```typescript
// Withdraw 0.5 ZEC from Aave back to available balance
await payroll.withdrawLentFunds('50000000'); // 0.5 ZEC
```

**Disable Auto-Lend:**
```typescript
await payroll.disableAutoLend();
```

### Validation Rules

- **Percentage:** Must be 1-100 (inclusive)
- **Protocol:** Any string (validated by NEAR Intents)
- **Chain:** Must be supported by NEAR Intents
- **Asset:** Must be valid NEP-141 token

### Balances Explained

Employees have TWO separate balances:

**1. Available Balance** (`get_balance`)
- Funds ready for withdrawal
- Not earning yield
- Can withdraw to NEAR wallet or cross-chain

**2. Lent Balance** (`get_lent_balance`)
- Funds in lending protocols
- Earning yield
- Must call `withdraw_lent_funds()` to move to available balance

### Gas and Deposits

- **Enable/Disable:** Standard gas (~5 TGas)
- **Withdraw Lent Funds:** 300 TGas + 1 yoctoNEAR (cross-chain)

---

## Supported Chains and Protocols

### Chains (via NEAR Intents)

- ✅ **Ethereum** - Aave, Compound
- ✅ **Solana** - Solend
- ✅ **Bitcoin** - (limited DeFi)
- ✅ **Near** - Native protocols
- ✅ **Arbitrum** - Layer 2 protocols
- ✅ **Base** - Layer 2 protocols

### Lending Protocols

- ✅ **Aave** (Ethereum, Arbitrum) - 3-5% APY on USDC
- ✅ **Compound** (Ethereum) - 2-4% APY on USDC
- ✅ **Solend** (Solana) - 5-8% APY on USDC

*Note: APY rates vary based on market conditions*

---

## Security Considerations

### Trust Model

1. **NEAR Intents Protocol** - Operated by Defuse Protocol team, audited
2. **PoA Bridge** - Proof of Authority bridge with trusted validators
3. **Smart Contracts** - Our payroll contract is non-custodial

### Risks

1. **Bridge Risk** - PoA Bridge validators control asset bridging
2. **Slippage Risk** - Market prices may move during swap
3. **Protocol Risk** - Lending protocols may have smart contract bugs
4. **Liquidation Risk** - Not applicable (we're lending, not borrowing)

### Best Practices

1. **Test with small amounts first**
2. **Set appropriate slippage tolerance** (2-5%)
3. **Monitor lent balances regularly**
4. **Diversify across protocols**
5. **Keep some funds in available balance** (liquidity)

---

## Troubleshooting

### Swap Failed

**Error: "Insufficient balance"**
- Check available balance: `getBalance(employeeId)`
- Ensure you're not swapping lent balance

**Error: "Slippage too high"**
- Market moved, try again with higher slippage
- Or swap smaller amount

**Error: "NEAR Intents not configured"**
- Owner must call `setNearIntentsContract('intents.near')`

### Auto-Lend Not Working

**Lent balance not increasing**
- Check config: `getAutoLendConfig(employeeId)`
- Ensure `enabled: true`
- Check percentage is >0

**Cannot withdraw lent funds**
- Lent balance may be 0
- Check: `getLentBalance(employeeId)`
- Protocol may have delays

### Gas Errors

**"Not enough gas"**
- Cross-chain operations need 300 TGas
- Increase gas in transaction

**"Requires deposit of 1 yoctoNEAR"**
- Add 1 yoctoNEAR deposit to cross-contract calls

---

## Integration with Zcash Bridge

The DeFi features work seamlessly with the existing Zcash bridge:

**Flow:**
```
1. Deposit ZEC to shielded address → wZEC minted on NEAR
2. Pay employee → wZEC credited to employee balance
3. Employee enables auto-lend → 30% automatically to Aave
4. Employee swaps remaining → 70% to USDC on Ethereum
```

**Privacy:**
- Zcash transactions are private
- NEAR transactions are public (wZEC amounts visible)
- DeFi operations are public (swap amounts visible)
- Salary commitments remain private (ZK proofs)

---

## Cost Analysis

### Gas Costs (NEAR)

| Operation | Gas | Cost (approx) |
|-----------|-----|---------------|
| Enable auto-lend | 5 TGas | $0.0005 |
| Disable auto-lend | 5 TGas | $0.0005 |
| Swap balance | 300 TGas | $0.03 |
| Withdraw lent funds | 300 TGas | $0.03 |

*Based on NEAR gas prices as of Dec 2025*

### Bridge Fees

| Bridge | Fee | Notes |
|--------|-----|-------|
| PoA Bridge | 0.1% | Fixed fee |
| NEAR Intents | ~0.3% | Dynamic, depends on route |
| Total | ~0.4% | For full cross-chain swap |

### Example Calculation

**Swap 1 ZEC ($3000) to USDC:**
- Gas: ~$0.03
- Bridge fee: ~$12 (0.4%)
- **Total cost: ~$12.03**
- **Receive: ~$2987.97 USDC**

---

## Roadmap

### Current (v1.0)
- ✅ Cross-chain swap via NEAR Intents
- ✅ Auto-lend to major protocols
- ✅ Multiple chain support
- ✅ TypeScript SDK with widgets

### Planned (v1.1)
- 🔄 Auto-compound yields
- 🔄 Batch operations (swap + lend in one tx)
- 🔄 Advanced strategies (DCA, rebalancing)
- 🔄 Portfolio tracking UI

### Future (v2.0)
- 🔮 Private DeFi (confidential amounts)
- 🔮 Zcash native DeFi integration
- 🔮 AI-powered yield optimization
- 🔮 Cross-chain private payments

---

## Support and Resources

### Documentation
- [Frontend Integration Guide](./FRONTEND_INTEGRATION.md)
- [Mainnet Deployment Guide](./MAINNET_DEPLOYMENT.md)
- [Architecture Documentation](./ARCHITECTURE.md)

### External Resources
- [NEAR Intents Protocol](https://intents.near.page)
- [Defuse Protocol Docs](https://docs.defuse.org)
- [PoA Bridge Documentation](https://near.org/bridge)

### Community
- Discord: [NEAR Protocol Discord](https://discord.gg/near)
- Telegram: [NEAR Developers](https://t.me/neardev)
- Forum: [NEAR Forum](https://forum.near.org)

---

**Next Steps:**
1. Review [Frontend Integration Guide](./FRONTEND_INTEGRATION.md)
2. Test on mainnet with small amounts
3. Configure DeFi settings for your employees
4. Monitor and optimize based on usage

---

*Generated with Claude Code - December 2, 2025*
