# Schema
cp ~/Downloads/schema.prisma prisma/schema.prisma

# Prisma client singleton
cp ~/Downloads/prisma.ts src/lib/prisma.ts

# Auth
cp ~/Downloads/auth-options.ts src/lib/auth-options.ts
cp ~/Downloads/auth-helper.ts src/lib/auth-helper.ts
mkdir -p src/app/api/auth/\[...nextauth\]
cp ~/Downloads/nextauth-route.ts src/app/api/auth/\[...nextauth\]/route.ts

# API routes
mkdir -p src/app/api/user/watchlist
cp ~/Downloads/api-user-watchlist-route.ts src/app/api/user/watchlist/route.ts

mkdir -p src/app/api/user/preferences
cp ~/Downloads/api-user-preferences-route.ts src/app/api/user/preferences/route.ts

mkdir -p src/app/api/alerts
cp ~/Downloads/api-alerts-route.ts src/app/api/alerts/route.ts

mkdir -p src/app/api/alerts/read
cp ~/Downloads/api-alerts-read-route.ts src/app/api/alerts/read/route.ts

mkdir -p src/app/api/alerts/settings
cp ~/Downloads/api-alerts-settings-route.ts src/app/api/alerts/settings/route.ts

# Signal detectors
cp ~/Downloads/signal-detectors.ts src/lib/signal-detectors.ts

# Alert engine cron
mkdir -p src/app/api/cron/alert-engine
cp ~/Downloads/api-cron-alert-engine-route.ts src/app/api/cron/alert-engine/route.ts

# Updated stores
cp ~/Downloads/stores-index.ts src/stores/index.ts

# Vercel config
cp ~/Downloads/vercel.json vercel.json