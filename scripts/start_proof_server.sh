#!/bin/bash
# Start the RISC Zero proof server
# Usage: ./scripts/start_proof_server.sh [--release]

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get to project root
cd "$(dirname "$0")/.."

# Parse arguments
BUILD_MODE="debug"
if [ "$1" = "--release" ]; then
    BUILD_MODE="release"
    RELEASE_FLAG="--release"
fi

echo -e "${BLUE}=== RISC Zero Proof Server Startup ===${NC}"
echo -e "Build mode: ${GREEN}${BUILD_MODE}${NC}"
echo ""

# Check if ELF binaries exist
ELF_DIR="$PWD/target/riscv32im-risc0-zkvm-elf/docker"
if [ ! -d "$ELF_DIR" ]; then
    echo -e "${YELLOW}Warning: ELF directory not found at ${ELF_DIR}${NC}"
    echo -e "${YELLOW}Building circuits...${NC}"
    cargo build --release
fi

# Check if already running
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${YELLOW}Proof server is already running at http://localhost:3000${NC}"
    echo ""
    curl -s http://localhost:3000/status | jq .
    echo ""
    echo -e "${GREEN}Server is ready!${NC}"
    exit 0
fi

# Start the server
echo -e "${BLUE}Starting proof server...${NC}"
echo -e "ELF directory: ${GREEN}${ELF_DIR}${NC}"
echo ""

ELF_DIR="$ELF_DIR" cargo run -p proof-server $RELEASE_FLAG
