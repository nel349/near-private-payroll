#!/bin/bash
set -e

echo "🔨 Building wZEC Token Contract"
echo "================================"

# Navigate to project root
cd "$(dirname "$0")/../.."

# Build the contract using cargo-near
echo "Building WASM..."
cargo near build --manifest-path contracts/wzec-token/Cargo.toml

# Check if build was successful
if [ -f "target/near/wzec_token/wzec_token.wasm" ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "WASM file: target/near/wzec_token/wzec_token.wasm"
    ls -lh target/near/wzec_token/wzec_token.wasm
    echo ""
    echo "You can now deploy with:"
    echo "  cd contracts/wzec-token"
    echo "  ./deploy.sh YOUR_ACCOUNT.testnet"
else
    echo ""
    echo "❌ Build failed - WASM file not found"
    exit 1
fi
