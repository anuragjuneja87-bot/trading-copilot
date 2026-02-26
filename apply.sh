# 1. Replace panels
cp ~/Downloads/options-flow-panel.tsx src/components/ask/options-flow-panel.tsx
cp ~/Downloads/dark-pool-panel.tsx src/components/ask/dark-pool-panel.tsx

# 2. Manual edit page.tsx (2 lines added):
# Line ~508: Add ticker={selectedTicker} to <OptionsFlowPanel
# Line ~534: Add ticker={selectedTicker} to <DarkPoolPanel