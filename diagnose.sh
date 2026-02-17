#!/bin/bash

echo "=========================================="
echo "TRADING PLATFORM AI DIAGNOSIS"
echo "=========================================="

echo ""
echo "1. PRICES"
echo "---"
curl -s "http://localhost:3000/api/market/prices?tickers=SPY" | jq '.data'

echo ""
echo "2. LEVELS"
echo "---"
curl -s "http://localhost:3000/api/market/levels/SPY" | jq '.data'

echo ""
echo "3. FLOW STATS"
echo "---"
curl -s "http://localhost:3000/api/flow/options?tickers=SPY&limit=10" | jq '.data.stats'

echo ""
echo "4. DARK POOL STATS"
echo "---"
curl -s "http://localhost:3000/api/darkpool?tickers=SPY&limit=10" | jq '.data.stats'

echo ""
echo "5. NEWS SENTIMENT"
echo "---"
curl -s "http://localhost:3000/api/news?tickers=SPY&limit=5" | jq '{articles: [.data.articles[]? | {title, sentiment, source}], summary: .data.sentimentSummary}'

echo ""
echo "6. MARKET PULSE"
echo "---"
curl -s "http://localhost:3000/api/market-pulse" | jq '.data'

echo ""
echo "=========================================="
echo "7. AI THESIS (NO CONTEXT)"
echo "=========================================="
curl -s -X POST "http://localhost:3000/api/ai/format" \
  -H "Content-Type: application/json" \
  -d '{"templateType":"symbol_thesis","tickers":["SPY"]}' | jq '{narrative: .data.narrative, elapsed: .data.elapsed}'

echo ""
echo "=========================================="
echo "DIAGNOSIS COMPLETE"
echo "=========================================="
