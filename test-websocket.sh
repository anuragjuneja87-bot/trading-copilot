#!/bin/bash

# Test WebSocket Real-Time Options Flow
# 
# Prerequisites:
# - Install wscat: npm install -g wscat
# - Or install websocat: brew install websocat (macOS) / cargo install websocat (Linux)

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

MASSIVE_API_KEY="${NEXT_PUBLIC_MASSIVE_API_KEY:-your_api_key_here}"
MASSIVE_WS_URL="${NEXT_PUBLIC_MASSIVE_WS_URL:-wss://socket.massive.com}"

echo "=========================================="
echo "Testing Massive.com WebSocket Options Flow"
echo "=========================================="
echo ""
echo "API Key: ${MASSIVE_API_KEY:0:10}..."
echo "WebSocket URL: ${MASSIVE_WS_URL}/options/AM"
echo ""

# Test 1: REST API (using curl)
echo "1. Testing REST API endpoint (curl)..."
echo "----------------------------------------"
curl -X GET "http://localhost:3000/api/flow/options?tickers=SPY&minPremium=0&limit=10" \
  -H "Content-Type: application/json" \
  | jq '.'
echo ""
echo ""

# Test 2: WebSocket using wscat (if installed)
if command -v wscat &> /dev/null; then
  echo "2. Testing WebSocket connection (wscat)..."
  echo "----------------------------------------"
  echo "Connecting to: ${MASSIVE_WS_URL}/options/AM?apiKey=${MASSIVE_API_KEY:0:10}..."
  echo ""
  echo "Once connected, send subscription message:"
  echo '  {"action":"subscribe","ticker":"O:SPY240119C00450000"}'
  echo ""
  echo "Press Ctrl+C to exit"
  echo ""
  
  wscat -c "${MASSIVE_WS_URL}/options/AM?apiKey=${MASSIVE_API_KEY}"
  
elif command -v websocat &> /dev/null; then
  echo "2. Testing WebSocket connection (websocat)..."
  echo "----------------------------------------"
  echo "Connecting to: ${MASSIVE_WS_URL}/options/AM?apiKey=${MASSIVE_API_KEY:0:10}..."
  echo ""
  echo "Once connected, send subscription message:"
  echo '  {"action":"subscribe","ticker":"O:SPY240119C00450000"}'
  echo ""
  
  echo '{"action":"subscribe","ticker":"O:SPY240119C00450000"}' | \
    websocat "${MASSIVE_WS_URL}/options/AM?apiKey=${MASSIVE_API_KEY}"
  
else
  echo "2. WebSocket testing tools not found"
  echo "----------------------------------------"
  echo "Install one of the following:"
  echo "  - wscat: npm install -g wscat"
  echo "  - websocat: brew install websocat (macOS) or cargo install websocat (Linux)"
  echo ""
  echo "Or use the Node.js test script: node test-websocket.js"
fi

echo ""
echo "=========================================="
echo "Test Complete"
echo "=========================================="
