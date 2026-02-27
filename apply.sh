# Landing page (replace)
cp ~/Downloads/landing-redesign/landing-page.tsx src/components/landing/landing-page.tsx

# Disclaimer gate (new)
cp ~/Downloads/landing-redesign/disclaimer-gate.tsx src/components/ask/disclaimer-gate.tsx

# Disclaimer API (new)
mkdir -p src/app/api/user/disclaimer
cp ~/Downloads/landing-redesign/api-user-disclaimer-route.ts src/app/api/user/disclaimer/route.ts