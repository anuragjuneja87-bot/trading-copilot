# New API route
mkdir -p src/app/api/timeline/\[ticker\]
cp ~/Downloads/timeline-route.ts src/app/api/timeline/\[ticker\]/route.ts

# Updated components  
cp ~/Downloads/confidence-timeline.tsx src/components/ask/confidence-timeline.tsx
cp ~/Downloads/yodha-analysis.tsx src/components/ask/yodha-analysis.tsx
cp ~/Downloads/page.tsx src/app/ask/page.tsx

git add -A && git commit -m "feat: server-side timeline API + weighted bias score, no more localStorage" && git push