# New chart component (TV Lightweight Charts)
cp ~/Downloads/yodha-chart.tsx src/components/ask/yodha-chart.tsx

# Fixed candles API (proper date ranges)
cp ~/Downloads/candles-route.ts src/app/api/candles/\[ticker\]/route.ts

# Page layout (chart moved below chatbot)
cp ~/Downloads/page.tsx src/app/ask/page.tsx

# Analysis (pressure chart removed - now in main chart)
cp ~/Downloads/yodha-analysis.tsx src/components/ask/yodha-analysis.tsx

git add -A && git commit -m "feat: TV Lightweight Charts, fix date ranges, reorder layout" && git push