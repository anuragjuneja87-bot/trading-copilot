# Deploy
cp ~/Downloads/panel-design-system.ts src/lib/panel-design-system.ts
cp ~/Downloads/options-flow-panel.tsx src/components/ask/options-flow-panel.tsx
cp ~/Downloads/dark-pool-panel.tsx src/components/ask/dark-pool-panel.tsx
cp ~/Downloads/gamma-levels-panel.tsx src/components/ask/gamma-levels-panel.tsx
cp ~/Downloads/volume-pressure-panel.tsx src/components/ask/volume-pressure-panel.tsx
cp ~/Downloads/relative-strength-panel.tsx src/components/ask/relative-strength-panel.tsx
cp ~/Downloads/news-sentiment-panel.tsx src/components/ask/news-sentiment-panel.tsx

git add -A && git commit -m "fix: independent session fetch for flow/DP charts, adaptive Y-axis, RS chart visibility" && git push origin main