# Payroll Factory Contract

The Payroll Factory is a smart contract that deploys individual payroll contracts for companies. This follows the common NEAR factory pattern used by DAOs, NFT platforms, and other multi-tenant applications.

## Architecture

```
payroll-factory.testnet (factory contract)
├── acme-corp-1733123456789.payroll-factory.testnet
├── widgets-inc-1733123457890.payroll-factory.testnet
└── startup-xyz-1733123458901.payroll-factory.testnet
```

Each company gets their own isolated payroll contract deployed as a subaccount of the factory.

## Why Factory Pattern?

1. **Wallet Compatibility** - Works with all wallets (just a function call, not a deployment action)
2. **Security** - Users don't need deployment permissions
3. **Consistency** - All contracts initialized with correct parameters
4. **Scalability** - Can add registration fees, whitelisting, upgrades, etc.

## Deployment Instructions

### 1. Build Contracts

First, build both the factory and the payroll contract:

```bash
# Build payroll contract
cd ../payroll
cargo near build

# Build factory contract
cd ../payroll-factory
cargo near build non-reproducible-wasm
```

### 2. Deploy Factory Contract

Deploy the factory contract to testnet (only needs to be done once):

```bash
cd /Users/norman/Development/NEAR/near-private-payroll/contracts/payroll-factory

# Deploy factory (replace with your account)
./deploy.sh your-account.testnet
```

This will:
- Create `payroll-factory.testnet` account
- Deploy the factory contract
- Initialize with owner and infrastructure contract addresses

### 3. Upload Payroll WASM

Upload the payroll contract WASM to the factory so it can deploy new instances:

```bash
# Upload WASM (replace with your account)
./upload-wasm.sh your-account.testnet
```

This will:
- Read the compiled payroll contract WASM
- Upload it to the factory contract's state
- Verify the factory is ready

### 4. Verify Factory is Ready

Check that the factory is properly configured:

```bash
near contract call-function as-read-only payroll-factory.testnet is_ready \
  json-args '{}' \
  network-config testnet \
  now
```

Should return: `true`

Get factory stats:

```bash
near contract call-function as-read-only payroll-factory.testnet get_stats \
  json-args '{}' \
  network-config testnet \
  now
```

Should show:
```json
{
  "total_companies": 0,
  "wzec_token": "wzec.testnet",
  "zk_verifier": "verifier.testnet",
  "wasm_set": true
}
```

## Usage from Frontend

Once the factory is deployed and WASM is uploaded, the frontend can create companies:

```typescript
import { useWalletSelector } from '@near-wallet-selector/react-hook';
import { CONFIG } from '@/config/contracts';

function CreateCompany() {
  const { callFunction } = useWalletSelector();

  const createCompany = async (companyName: string) => {
    // Call factory to deploy new payroll contract
    const contractAddress = await callFunction({
      contractId: CONFIG.payrollFactory,
      method: 'create_company',
      args: { company_name: companyName },
      gas: '300000000000000', // 300 TGas
      deposit: '5000000000000000000000000', // 5 NEAR
    });

    console.log('Payroll contract deployed at:', contractAddress);
    // contractAddress will be: company-name-timestamp.payroll-factory.testnet
  };
}
```

## Contract Methods

### `create_company(company_name: String)`

Creates a new payroll contract for a company.

**Arguments:**
- `company_name`: Company name (will be sanitized for account ID)

**Attached Deposit:** 5 NEAR (for contract storage)

**Returns:** Contract address (e.g., `acme-1733123456789.payroll-factory.testnet`)

**Process:**
1. Validates attached deposit ≥ 5 NEAR
2. Sanitizes company name to valid account ID
3. Adds timestamp for uniqueness
4. Creates subaccount `{name}-{timestamp}.payroll-factory.testnet`
5. Deploys payroll WASM to subaccount
6. Initializes with caller as owner
7. Returns contract address

### `set_payroll_wasm(wasm: Vec<u8>)`

Uploads or updates the payroll contract WASM.

**Owner only**

**Arguments:**
- `wasm`: Compiled payroll contract WASM bytes

### `get_stats()`

Returns factory statistics.

**Returns:**
```json
{
  "total_companies": 42,
  "wzec_token": "wzec.testnet",
  "zk_verifier": "verifier.testnet",
  "wasm_set": true
}
```

### `is_ready()`

Checks if factory is ready to deploy contracts.

**Returns:** `true` if WASM is uploaded, `false` otherwise

## Infrastructure Contracts

The factory automatically initializes new payroll contracts with:
- **wZEC Token** (`wzec.testnet`) - Wrapped ZEC for payments
- **ZK Verifier** (`verifier.testnet`) - RISC Zero proof verification

These must be deployed before using the factory.

## Security

- Only factory owner can update WASM
- Each company contract is isolated (separate subaccount)
- Factory cannot access deployed contract data
- Users maintain full ownership of their deployed contracts

## Troubleshooting

**Error: "Wallet not connected"**
- Make sure you're signed in with NEAR wallet

**Error: "Insufficient deposit"**
- Attach at least 5 NEAR when calling `create_company`

**Error: "Payroll WASM not set"**
- Run `upload-wasm.sh` to upload the payroll contract WASM

**Error: "Company name too short/long"**
- Company name must be 2-40 characters after sanitization
- Only alphanumeric characters are kept (others become hyphens)

## Next Steps

After deploying the factory:
1. Update frontend config with factory address
2. Deploy infrastructure contracts (wZEC, ZK verifier)
3. Test company creation from UI
4. Monitor gas usage and optimize if needed
