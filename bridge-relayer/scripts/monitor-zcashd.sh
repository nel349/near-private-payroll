#!/bin/bash

# Monitor zcashd sync progress

ZCASH_CLI="/Applications/Zecwallet Fullnode.app/Contents/Resources/bin/mac/zcash-cli"

echo "🔍 Monitoring zcashd testnet sync..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    clear
    echo "=== Zcashd Testnet Sync Status ==="
    echo ""

    # Get blockchain info
    INFO=$("$ZCASH_CLI" -testnet -rpcport=8233 getblockchaininfo 2>/dev/null)

    if [ $? -eq 0 ]; then
        BLOCKS=$(echo "$INFO" | grep '"blocks"' | awk '{print $2}' | tr -d ',')
        HEADERS=$(echo "$INFO" | grep '"headers"' | awk '{print $2}' | tr -d ',')
        PROGRESS=$(echo "$INFO" | grep '"verificationprogress"' | awk '{print $2}' | tr -d ',')

        echo "📊 Blocks: $BLOCKS"
        echo "📄 Headers: $HEADERS"
        echo "📈 Progress: $(echo "$PROGRESS * 100" | bc -l | cut -c1-5)%"
        echo ""

        # Get network info
        NETINFO=$("$ZCASH_CLI" -testnet -rpcport=8233 getnetworkinfo 2>/dev/null)
        CONNECTIONS=$(echo "$NETINFO" | grep '"connections"' | awk '{print $2}' | tr -d ',')

        echo "🌐 Connections: $CONNECTIONS"
        echo ""

        # Estimate time remaining (very rough)
        if [ "$BLOCKS" -gt "0" ] && [ "$HEADERS" -gt "0" ]; then
            REMAINING=$((HEADERS - BLOCKS))
            echo "⏳ Blocks remaining: $REMAINING"
        fi
    else
        echo "❌ Cannot connect to zcashd"
        echo "   Make sure zcashd is running"
    fi

    echo ""
    echo "Last updated: $(date)"
    echo ""
    echo "Zcashd address for testnet ZEC:"
    echo "ztestsapling1ydr32a678tr6lcgmxhvqcekk7tg0ekmt7hhzkcj0rjw84qe3ha5rwd989hxz4w5kqy9rw6ka6cj"

    sleep 30
done
