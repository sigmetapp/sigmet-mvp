#!/bin/bash

# Full Load Test Runner
# Запускает мониторинг ресурсов и нагрузочный тест одновременно

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL=${BASE_URL:-"http://localhost:3000"}
CONCURRENT_USERS=${CONCURRENT_USERS:-200}
DURATION_SECONDS=${DURATION_SECONDS:-300}
MONITOR_DURATION=$((DURATION_SECONDS + 60)) # Monitor for 1 minute longer

echo -e "${GREEN}Starting Full Load Test Suite${NC}"
echo "=================================="
echo "Target URL: $BASE_URL"
echo "Concurrent Users: $CONCURRENT_USERS"
echo "Duration: $DURATION_SECONDS seconds"
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start monitoring in background
echo -e "${YELLOW}Starting resource monitoring...${NC}"
MONITOR_DURATION_SECONDS=$MONITOR_DURATION \
  node "$SCRIPT_DIR/monitor-resources.js" > "$SCRIPT_DIR/monitor.log" 2>&1 &
MONITOR_PID=$!

# Wait a bit for monitor to start
sleep 2

# Start load test
echo -e "${YELLOW}Starting load test...${NC}"
BASE_URL=$BASE_URL \
  CONCURRENT_USERS=$CONCURRENT_USERS \
  DURATION_SECONDS=$DURATION_SECONDS \
  node "$SCRIPT_DIR/node-load-test.js"

# Wait for monitor to finish
echo -e "${YELLOW}Waiting for monitoring to finish...${NC}"
wait $MONITOR_PID

echo ""
echo -e "${GREEN}Load test completed!${NC}"
echo "Check results:"
echo "  - Load test results: see console output above"
echo "  - Resource monitoring: $SCRIPT_DIR/load-test-resources.json"
echo "  - Monitor logs: $SCRIPT_DIR/monitor.log"