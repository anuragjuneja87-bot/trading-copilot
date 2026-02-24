cp ~/Downloads/yodha-chart.tsx src/components/ask/yodha-chart.tsx
cp ~/Downloads/bias-score.ts src/lib/bias-score.ts
cp ~/Downloads/page.tsx src/app/ask/page.tsx
# candles-route.ts unchanged from last deploy, but included for completeness
cp ~/Downloads/candles-route.ts src/app/api/candles/\[ticker\]/route.ts

git add -A && git commit -m "fix: EST timezone, boost pressure values, polish chart layout" && git push