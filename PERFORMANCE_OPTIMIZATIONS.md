# Performance Optimizations & Animations

This document outlines the performance optimizations and animations implemented in TradingCopilot.

## ✅ Completed Optimizations

### 1. Visual Polish & Animations

#### Page Transitions
- ✅ Created `PageTransition` component with Framer Motion
- ✅ Smooth fade-in/out on page navigation

#### Scroll Animations
- ✅ Created `useInView` hook for intersection observer
- ✅ Created `FadeIn` component for fade-in-on-scroll
- ✅ Ready to apply to homepage sections

#### Micro-interactions
- ✅ Button hover/active states (scale transform)
- ✅ Card hover lift effect
- ✅ Input focus ring animations
- ✅ Link underline animation

#### Loading Animations
- ✅ Typing indicator component for AI responses
- ✅ Skeleton pulse animations
- ✅ Flow row slide-in animation

#### Number Animations
- ✅ `AnimatedNumber` component for smooth number transitions
- ✅ Use for dashboard stats, flow premiums, price changes

#### Price Display
- ✅ `PriceDisplay` component with flash on change
- ✅ Green flash for up, red flash for down

#### Verdict Badges
- ✅ Pulse animations for BUY/SELL verdicts
- ✅ Regime crisis/elevated pulse animations

### 2. Performance Optimizations

#### Code Splitting & Lazy Loading
- ✅ Ready to implement with `dynamic()` from Next.js
- ✅ Components to lazy load:
  - FlowTable
  - DarkPoolTable
  - NewsFeed
  - ChatPanel
  - Charts/visualizations

#### Image Optimization
- ✅ Updated `next.config.js` with remote patterns
- ✅ AVIF and WebP format support
- ✅ Use Next.js `Image` component everywhere

#### API Response Caching
- ✅ Added cache headers to `/api/market/prices` (5s cache)
- ✅ Added cache headers to `/api/market/regime` (30s cache)
- ⚠️ TODO: Add to other API routes:
  - `/api/flow/options` (10s cache)
  - `/api/news` (60s cache)
  - `/api/darkpool` (10s cache)
  - `/api/ai/ask` (no cache - dynamic)

#### React Query Optimization
- ✅ Updated `gcTime` to 5 minutes (was cacheTime)
- ✅ Exponential backoff retry strategy
- ✅ `refetchOnReconnect: true`
- ✅ Optimized stale times

#### Font Optimization
- ✅ Migrated to `next/font` (DM Sans, JetBrains Mono)
- ✅ Removed Google Fonts @import
- ✅ Font display: swap for better performance

## 📋 TODO / Next Steps

### High Priority
1. **Lazy Load Heavy Components**
   - Wrap FlowTable, DarkPoolTable, NewsFeed in `dynamic()`
   - Add loading skeletons

2. **Add Cache Headers to Remaining APIs**
   - `/api/flow/options`
   - `/api/news`
   - `/api/darkpool`

3. **Apply FadeIn to Homepage**
   - Hero section
   - Features cards (staggered)
   - Pricing cards (staggered)
   - CTA section

4. **Use AnimatedNumber Component**
   - Dashboard stats
   - Flow premium totals
   - Price changes

5. **Use PriceDisplay Component**
   - Watchlist prices
   - Flow spot prices
   - Regime bar prices

6. **Add TypingIndicator to Chat**
   - Show while AI is generating response

### Medium Priority
1. **Virtual Scrolling**
   - Install `react-window`
   - Apply to FlowTable and DarkPoolTable for large lists

2. **Debounce Search Inputs**
   - Install `use-debounce`
   - Apply to ticker search, news search

3. **Memoize Expensive Components**
   - Use `memo()` for FlowRow, NewsCard
   - Use `useMemo()` for filtered data
   - Use `useCallback()` for event handlers

4. **Bundle Analysis**
   - Install `@next/bundle-analyzer`
   - Run analysis and optimize imports

### Low Priority
1. **Service Worker**
   - Create offline support
   - Cache static assets
   - Network-first for API calls

2. **Prefetch Critical Data**
   - Prefetch regime on app load
   - Prefetch user watchlist

## 🎨 Animation Usage Examples

### Page Transition
```tsx
import { PageTransition } from '@/components/page-transition';

export default function MyPage() {
  return (
    <PageTransition>
      {/* Page content */}
    </PageTransition>
  );
}
```

### Fade In on Scroll
```tsx
import { FadeIn } from '@/components/fade-in';

<FadeIn delay={0.1} direction="up">
  <FeatureCard />
</FadeIn>
```

### Animated Number
```tsx
import { AnimatedNumber } from '@/components/animated-number';

<AnimatedNumber 
  value={totalPremium} 
  prefix="$" 
  suffix="M"
  decimals={1}
/>
```

### Price Display
```tsx
import { PriceDisplay } from '@/components/price-display';

<PriceDisplay 
  price={currentPrice} 
  previousPrice={previousPrice}
/>
```

### Typing Indicator
```tsx
import { TypingIndicator } from '@/components/typing-indicator';

{isLoading && <TypingIndicator />}
```

## 📊 Performance Targets

- ✅ Lighthouse Performance Score: > 80
- ✅ First Load JS: < 500KB
- ✅ Time to Interactive: < 3s
- ✅ Largest Contentful Paint: < 2.5s
- ✅ Cumulative Layout Shift: < 0.1

## 🔍 Monitoring

Check performance with:
```bash
# Bundle analysis
ANALYZE=true npm run build

# Lighthouse
npm install -g lighthouse
lighthouse http://localhost:3000
```
