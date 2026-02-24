# New: Candles API
mkdir -p src/app/api/candles/\[ticker\]
cp ~/Downloads/candles-route.ts src/app/api/candles/\[ticker\]/route.ts

# New: Yodha Chart component
cp ~/Downloads/yodha-chart.tsx src/components/ask/yodha-chart.tsx

# Updated: Page layout (TradingView → YodhaChart, reordered)
cp ~/Downloads/page.tsx src/app/ask/page.tsx

# Updated: Analysis (removed duplicate pressure chart)
cp ~/Downloads/yodha-analysis.tsx src/components/ask/yodha-analysis.tsx

# Carry forward from earlier session
cp ~/Downloads/bias-score.ts src/lib/bias-score.ts
cp ~/Downloads/confidence-timeline.tsx src/components/ask/confidence-timeline.tsx
cp ~/Downloads/timeline-route.ts src/app/api/timeline/\[ticker\]/route.ts
cp ~/Downloads/score-worker-route.ts src/app/api/cron/score-worker/route.ts
cp ~/Downloads/ml-predict-route.ts src/app/api/ml/predict/route.ts
cp ~/Downloads/relative-strength-panel.tsx src/components/ask/relative-strength-panel.tsx
cp ~/Downloads/use-war-room-data.ts src/hooks/use-war-room-data.ts
cp ~/Downloads/vercel.json vercel.json

git add -A && git commit -m "feat: replace TradingView with Yodha chart, Redis-backed candles + pressure" && git push