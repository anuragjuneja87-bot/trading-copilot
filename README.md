# TradingCopilot

AI-powered trading intelligence platform. Stop staring at options flow — start getting answers.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Radix UI
- **State:** Zustand (client) + TanStack Query (server)
- **Real-time:** Socket.io (WebSocket) + Polling fallback
- **Database:** PostgreSQL via Prisma (Supabase/Neon)
- **Auth:** NextAuth.js
- **Payments:** Stripe
- **AI Backend:** Databricks Serving Endpoint (your Supervisor agent)
- **Market Data:** Polygon.io

## Features

- 🤖 **AI Trading Copilot** — Ask questions, get verdicts with levels
- 📊 **Real-time Options Flow** — Sweeps, blocks, unusual activity
- 🚨 **Crisis Detection** — Automatic regime awareness
- 📈 **Key Levels** — Gamma walls, pivots, round numbers
- 🌅 **Morning Briefing** — Pre-market synthesis at 7 AM
- 🔔 **Alerts** — In-app, email, SMS (tier-gated)

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd trading-platform
npm install
```

### 2. Environment Setup

Copy the example env file:

```bash
cp .env.example .env.local
```

Fill in your credentials:

```env
# Required
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi_xxxxx
DATABRICKS_ENDPOINT=mas-7ab7b2ce-endpoint
POLYGON_API_KEY=your_polygon_key
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

# Optional (for payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# (Optional) Open Prisma Studio
npm run db:studio
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── ai/           # AI/Supervisor endpoints
│   │   ├── market/       # Price, regime endpoints
│   │   └── flow/         # Options flow endpoints
│   ├── ask/              # Free AI chat page
│   ├── flow/             # Options flow page
│   ├── pricing/          # Pricing page
│   └── page.tsx          # Homepage
├── components/
│   ├── ui/               # Base UI components (Button, Card, etc.)
│   ├── layout/           # Navbar, Footer
│   └── trading/          # Trading-specific components
├── hooks/                 # React hooks (usePrices, useFlow, etc.)
├── lib/                   # Utilities, API client, socket
├── stores/               # Zustand stores
├── types/                # TypeScript types
└── styles/               # Global CSS
```

## Architecture

### Real-Time Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Polygon API    │────▶│  API Routes     │────▶│  TanStack Query │
│  (market data)  │     │  (Next.js)      │     │  (client cache) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
┌─────────────────┐     ┌─────────────────┐            ▼
│  Databricks     │────▶│  /api/ai/ask    │────▶  Zustand Store
│  Supervisor     │     │  (AI endpoint)  │     │  (UI state)   │
└─────────────────┘     └─────────────────┘     └───────────────┘
```

### Tier-Gated Features

| Feature          | Free     | Pro ($29) | Elite ($79) |
|------------------|----------|-----------|-------------|
| AI Questions     | 3/day    | 100/day   | Unlimited   |
| Options Flow     | 30m delay| Real-time | Real-time   |
| Dark Pool        | ❌        | ✅         | ✅           |
| Watchlist        | 5        | 15        | 50          |
| Alerts           | ❌        | In-app    | SMS + Push  |
| API Access       | ❌        | ❌         | ✅           |

## API Routes

### AI

- `POST /api/ai/ask` — Send question to Supervisor, get verdict
- `GET /api/ai/briefing` — Get cached morning briefing

### Market Data

- `GET /api/market/prices?tickers=SPY,QQQ` — Get current prices
- `GET /api/market/regime` — Get market regime status (normal/elevated/crisis)
- `GET /api/market/levels/:ticker` — Get key levels for ticker

### Options Flow

- `GET /api/flow/options` — Get filtered options flow
  - `?tickers=SPY,NVDA` — Filter by tickers
  - `?minPremium=100000` — Minimum premium
  - `?unusual=true` — Only unusual activity
  - `?sweeps=true` — Only sweeps
  - `?callPut=C` — Calls only (or P for puts)

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

### Railway / Render

Both support Next.js out of the box. Just connect your repo and add env vars.

## Connecting to Databricks

Your AI backend is a Databricks Serving Endpoint running the Supervisor agent. The app calls it via REST:

```typescript
// In /api/ai/ask/route.ts
const response = await fetch(
  `${DATABRICKS_HOST}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
    },
    body: JSON.stringify({
      input: messages, // Databricks uses "input" not "messages"
    }),
  }
);
```

The Supervisor then:
1. Calls 13+ UC functions (news, gamma, levels, etc.)
2. Queries RAG agents (Research, Strategy)
3. Synthesizes into a concise verdict

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make changes
4. Run `npm run lint`
5. Submit a PR

## License

MIT

---

**Disclaimer:** TradingCopilot is not a registered investment advisor. Information provided does not constitute investment advice. Trading involves risk of loss. Past performance does not guarantee future results.
