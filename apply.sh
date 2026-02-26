# 1. Copy shared design system (NEW file)
cp ~/Downloads/panel-design-system.ts src/lib/panel-design-system.ts

# 2. Copy all 6 panels (REPLACEMENTS)
cp ~/Downloads/options-flow-panel.tsx src/components/ask/options-flow-panel.tsx
cp ~/Downloads/dark-pool-panel.tsx src/components/ask/dark-pool-panel.tsx
cp ~/Downloads/gamma-levels-panel.tsx src/components/ask/gamma-levels-panel.tsx
cp ~/Downloads/volume-pressure-panel.tsx src/components/ask/volume-pressure-panel.tsx
cp ~/Downloads/relative-strength-panel.tsx src/components/ask/relative-strength-panel.tsx
cp ~/Downloads/news-sentiment-panel.tsx src/components/ask/news-sentiment-panel.tsx

# 3. Deploy
git add -A && git commit -m "v3 panel redesign: canvas-rendered, mockup-exact, shared design system" && git push origin main