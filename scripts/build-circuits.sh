#!/bin/bash
# Build RISC Zero circuits and output Image IDs
#
# Prerequisites:
#   - RISC Zero toolchain: curl -L https://risczero.com/install | bash && rzup install
#   - Docker running (for reproducible builds)
#
# Usage:
#   ./scripts/build-circuits.sh [circuit-name]  # Build specific circuit
#   ./scripts/build-circuits.sh                 # Build all circuits

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CIRCUITS_DIR="$PROJECT_ROOT/circuits"
TARGET_DIR="$PROJECT_ROOT/target/riscv32im-risc0-zkvm-elf/docker"

echo "=== RISC Zero Circuit Builder ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Check prerequisites
if ! command -v cargo-risczero &> /dev/null; then
    echo "ERROR: cargo-risczero not found"
    echo "Install with: curl -L https://risczero.com/install | bash && rzup install"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "ERROR: Docker is not running"
    echo "Please start Docker Desktop"
    exit 1
fi

# Determine which circuits to build
if [ -n "$1" ]; then
    CIRCUITS=("$1")
else
    CIRCUITS=("income-proof" "payment-proof" "balance-proof")
fi

echo "Building ${#CIRCUITS[@]} circuit(s)..."
echo ""

# Store ImageIDs for later display (Bash 3.2 compatible)
# Use parallel indexed arrays instead of associative arrays
CIRCUIT_NAMES=()
CIRCUIT_IMAGE_IDS=()

for circuit in "${CIRCUITS[@]}"; do
    CIRCUIT_DIR="$CIRCUITS_DIR/$circuit"

    if [ ! -d "$CIRCUIT_DIR" ]; then
        echo "WARNING: Circuit directory not found: $CIRCUIT_DIR"
        continue
    fi

    echo "=== Building $circuit ==="

    # Step 1: Always regenerate Cargo.lock from scratch
    # Docker build requires standalone lockfile, not workspace lockfile
    echo "Generating standalone Cargo.lock..."

    # Remove old lockfile to force fresh generation
    rm -f "$CIRCUIT_DIR/Cargo.lock"

    # Create temp directory OUTSIDE the workspace to generate fresh lockfile
    TEMP_DIR=$(mktemp -d)
    cp "$CIRCUIT_DIR/Cargo.toml" "$TEMP_DIR/"
    mkdir -p "$TEMP_DIR/src"
    cp "$CIRCUIT_DIR/src/main.rs" "$TEMP_DIR/src/"

    # Generate lockfile in isolated directory
    (cd "$TEMP_DIR" && cargo generate-lockfile 2>/dev/null)

    # Copy back to circuit directory
    cp "$TEMP_DIR/Cargo.lock" "$CIRCUIT_DIR/"
    rm -rf "$TEMP_DIR"
    echo "  Cargo.lock generated"

    # Step 2: Build with RISC Zero and capture ImageID
    echo "Running cargo risczero build (this may take a few minutes)..."
    BUILD_OUTPUT=$(cd "$CIRCUIT_DIR" && cargo risczero build --manifest-path Cargo.toml 2>&1)

    # Extract ImageID from output
    IMAGE_ID=$(echo "$BUILD_OUTPUT" | grep -o 'ImageID: [a-f0-9]*' | head -1 | cut -d' ' -f2)

    if [ -n "$IMAGE_ID" ]; then
        CIRCUIT_NAMES+=("$circuit")
        CIRCUIT_IMAGE_IDS+=("$IMAGE_ID")
        echo "  ImageID: $IMAGE_ID"
    else
        echo "  WARNING: Could not extract ImageID from build output"
        echo "$BUILD_OUTPUT" | tail -10
    fi

    echo ""
done

echo "=== Build Complete ==="
echo ""
echo "Circuit Image IDs:"
echo ""

# Iterate through built circuits using indices
for i in "${!CIRCUIT_NAMES[@]}"; do
    circuit="${CIRCUIT_NAMES[$i]}"
    image_id="${CIRCUIT_IMAGE_IDS[$i]}"
    ELF_FILE="$TARGET_DIR/${circuit}.bin"

    if [ -f "$ELF_FILE" ]; then
        echo "$circuit:"
        echo "  ELF:     $ELF_FILE"
        echo "  ImageID: $image_id"
        echo ""
    fi
done

echo "To use in proof-server, set:"
echo "  export ELF_DIR=$TARGET_DIR"
echo ""

# Output JSON format for programmatic use
echo "JSON format:"
echo "{"
first=true
for i in "${!CIRCUIT_NAMES[@]}"; do
    circuit="${CIRCUIT_NAMES[$i]}"
    image_id="${CIRCUIT_IMAGE_IDS[$i]}"

    if [ "$first" = true ]; then
        first=false
    else
        echo ","
    fi
    echo -n "  \"$circuit\": \"$image_id\""
done
echo ""
echo "}"
