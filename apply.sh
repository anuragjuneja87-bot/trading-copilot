# 1. Hook — Camarilla fields in levels (r3, r4, s3, s4, prevDayHLC)
cp ~/Downloads/use-war-room-data.ts src/hooks/use-war-room-data.ts

# 2. Chart — AI Pressure Engine branding + parent TF sync
cp ~/Downloads/yodha-chart.tsx src/components/ask/yodha-chart.tsx

# 3. Signal Confluence → AI Signal Engine
cp ~/Downloads/confluence-indicator.tsx src/components/war-room/confluence-indicator.tsx

# 4. Page — Camarilla in sidebar + prevDayHLC → chart
cp ~/Downloads/page.tsx src/app/ask/page.tsx

npm run dev