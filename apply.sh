cp ~/Downloads/thesis-upgrade/route.ts src/app/api/ai/thesis-v2/route.ts
cp ~/Downloads/thesis-upgrade/use-thesis.ts src/hooks/use-thesis.ts
cp ~/Downloads/thesis-upgrade/yodha-thesis.tsx src/components/ask/yodha-thesis.tsx
git add -A && git commit -m "feat: news-aware AI thesis - macro context, rewritten pre-market prompts" && git push
vercel --prod