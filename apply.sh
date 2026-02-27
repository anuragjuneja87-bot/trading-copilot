cp ~/Downloads/thesis-upgrade/route.ts src/app/api/ai/thesis-v2/route.ts
cp ~/Downloads/thesis-upgrade/use-thesis.ts src/hooks/use-thesis.ts
cp ~/Downloads/thesis-upgrade/yodha-thesis.tsx src/components/ask/yodha-thesis.tsx
git add -A && git commit -m "feat: thesis cache (100 users = 1 API call) + GEX flip distance filter" && git push
vercel --prod