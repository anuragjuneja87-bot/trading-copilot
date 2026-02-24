# Scoring algorithm
cp ~/Downloads/bias-score.ts src/lib/bias-score.ts

# Chart component (full rewrite)
cp ~/Downloads/confidence-timeline.tsx src/components/ask/confidence-timeline.tsx
cp ~/Downloads/yodha-analysis.tsx src/components/ask/yodha-analysis.tsx

# APIs
cp ~/Downloads/timeline-route.ts src/app/api/timeline/\[ticker\]/route.ts
cp ~/Downloads/score-worker-route.ts src/app/api/cron/score-worker/route.ts
cp ~/Downloads/ml-predict-route.ts src/app/api/ml/predict/route.ts

# Vercel cron (every minute, Pro)
cp ~/Downloads/vercel.json vercel.json

git add -A && git commit -m "feat: dual bull/bear pressure chart, amplified scoring, ML 60s timeout" && git push