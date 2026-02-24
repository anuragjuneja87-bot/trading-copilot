# New files
cp ~/Downloads/bias-score.ts src/lib/bias-score.ts
cp ~/Downloads/redis.ts src/lib/redis.ts
mkdir -p src/app/api/cron/score-worker
cp ~/Downloads/score-worker-route.ts src/app/api/cron/score-worker/route.ts
mkdir -p src/app/api/thesis-history/\[ticker\]
cp ~/Downloads/thesis-history-route.ts src/app/api/thesis-history/\[ticker\]/route.ts
cp ~/Downloads/vercel.json vercel.json

# Updated files
cp ~/Downloads/yodha-analysis.tsx src/components/ask/yodha-analysis.tsx
cp ~/Downloads/confidence-timeline.tsx src/components/ask/confidence-timeline.tsx
cp ~/Downloads/page.tsx src/app/ask/page.tsx

git add -A && git commit -m "feat: cron worker for continuous bias scoring, thesis storage for retraining" && git push