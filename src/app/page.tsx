'use client';

import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MarketPulseProvider,
  MarketPulseLeftSidebar,
  MarketPulseRightSidebar,
  MobileMarketPulse,
} from '@/components/homepage/market-pulse';
import { Hero } from '@/components/homepage/hero';
import { DataProviderStrip } from '@/components/homepage/data-provider-strip';
import { MetricsBar } from '@/components/homepage/metrics-bar';
import { Testimonials } from '@/components/homepage/testimonials';
import { 
  Zap, 
  AlertTriangle, 
  BarChart3, 
  Target,
  Check,
  ArrowRight,
  MessageSquare,
  TrendingUp,
  Shield,
  Clock,
  Brain,
  Activity,
  Sparkles,
  CheckCircle2,
  X,
  CheckCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5 }
};

const staggerChildren = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true },
  transition: { staggerChildren: 0.1 }
};

// Social proof stats
const stats = [
  { label: 'Trades analyzed daily', value: '10,000+' },
  { label: 'Data sources synthesized', value: '13' },
  { label: 'Crisis detection', value: 'Real-time' },
];

// How it works steps
const steps = [
  {
    number: '01',
    title: 'Ask Any Question',
    description: 'Use natural language to ask about any ticker, market condition, or trading setup. No need to learn complex queries.',
    icon: MessageSquare,
  },
  {
    number: '02',
    title: 'AI Analyzes 13 Sources',
    description: 'Our agent synthesizes options flow, gamma levels, news sentiment, cross-asset correlations, and more in real-time.',
    icon: Brain,
  },
  {
    number: '03',
    title: 'Get Actionable Verdicts',
    description: 'Receive clear BUY, SELL, or WAIT recommendations with specific entry levels, targets, and invalidation criteria.',
    icon: Target,
  },
];

// Key features
const features = [
  {
    icon: Target,
    title: 'AI Verdicts',
    description: 'Not just data, but decisions. BUY, SELL, or WAIT with specific levels, targets, and stop losses.',
    color: 'text-bull',
    bgColor: 'bg-bull/10',
  },
  {
    icon: AlertTriangle,
    title: 'Crisis Detection',
    description: '24/7 monitoring for market-moving events. Automatic regime awareness with real-time alerts.',
    color: 'text-bear',
    bgColor: 'bg-bear/10',
  },
  {
    icon: BarChart3,
    title: 'Options Intelligence',
    description: 'Gamma walls, dealer positioning, unusual flow, dark pool prints. See where the real levels are.',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
  {
    icon: Clock,
    title: 'Morning Briefings',
    description: 'Pre-market synthesis delivered before you trade. Know what matters before the bell rings.',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
  },
];

// Comparison data
const comparison = [
  { feature: 'Shows options flow', others: true, us: true },
  { feature: 'Tells you what to DO', others: false, us: true },
  { feature: 'AI chat with verdicts', others: false, us: true },
  { feature: 'Crisis detection', others: false, us: true },
  { feature: 'Gamma levels & dealer positioning', others: false, us: true },
  { feature: 'Session awareness', others: false, us: true },
  { feature: 'Morning briefing', others: false, us: true },
  { feature: 'Cross-asset context', others: false, us: true },
];

// Pricing tiers
const tiers = [
  {
    name: 'Free',
    price: '$0',
    description: 'Try before you buy',
    features: [
      '3 AI questions per day',
      'Delayed options flow (30 min)',
      '10 watchlist tickers',
      'Basic key levels',
    ],
    cta: 'Start Free',
    href: '/ask',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For active traders',
    features: [
      '100 AI questions per day',
      'Real-time options flow',
      '15 watchlist tickers',
      'Dark pool prints',
      'In-app alerts',
      'Full key levels + gamma',
    ],
    cta: 'Subscribe',
    href: '/pricing',
    popular: true,
  },
  {
    name: 'Elite',
    price: '$79',
    period: '/month',
    description: 'For serious traders',
    features: [
      'Unlimited AI questions',
      'Real-time everything',
      '50 watchlist tickers',
      'SMS + push alerts',
      'API access',
      'Priority support',
    ],
    cta: 'Subscribe',
    href: '/pricing',
    popular: false,
  },
];

export default function HomePage() {
  return (
    <MarketPulseProvider>
      <div className="min-h-screen bg-background">
        <Navbar />

        {/* Main content with sidebars */}
        <main className="flex justify-center">
          {/* Left Sidebar - Market Indicators */}
          <aside className="hidden lg:block sticky top-20 h-fit">
            <MarketPulseLeftSidebar />
          </aside>

          {/* Center Content - Hero */}
          <div className="flex-1 w-full max-w-7xl">
            {/* Hero Section */}
            <Hero />

            {/* Mobile Market Pulse - shows on smaller screens */}
            <div className="lg:hidden mt-8 px-4">
              <MobileMarketPulse />
            </div>
          </div>

          {/* Right Sidebar - Movers + News */}
          <aside className="hidden lg:block sticky top-20 h-fit">
            <MarketPulseRightSidebar />
          </aside>
        </main>

        {/* Data Provider Strip */}
        <DataProviderStrip />

        {/* Metrics Bar */}
        <MetricsBar />

        {/* Social Proof Bar */}
        <section className="border-y border-border bg-background-surface py-8">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className="text-center"
              >
                <div className="text-3xl font-bold text-text-primary">{stat.value}</div>
                <div className="mt-1 text-sm text-text-secondary">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
            
            {/* How It Works Section */}
            <section className="py-20 lg:py-32 bg-background">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <motion.div
            {...fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl lg:text-5xl">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
              Three simple steps from question to actionable trading decision
            </p>
          </motion.div>
          
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                className="relative"
              >
                <div className="rounded-xl border border-border bg-background-card p-8 h-full">
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-lg bg-accent/10">
                    <step.icon className="h-7 w-7 text-accent" />
                  </div>
                  <div className="text-5xl font-bold text-text-muted/20 mb-2">{step.number}</div>
                  <h3 className="text-xl font-semibold text-text-primary mb-3">{step.title}</h3>
                  <p className="text-text-secondary">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section className="py-20 lg:py-32 bg-background-surface">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <motion.div
            {...fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl lg:text-5xl">
              Key Features
            </h2>
            <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
              Everything you need to make smarter trading decisions
            </p>
          </motion.div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className="rounded-xl border border-border bg-background-card p-6 transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${feature.bgColor}`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">{feature.title}</h3>
                <p className="text-sm text-text-secondary">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-20 lg:py-32 bg-background">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <motion.div
            {...fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl lg:text-5xl">
              Research Tools vs. TradingCopilot
            </h2>
            <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
              Other tools show you data. We tell you what to do with it.
            </p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-border bg-background-card"
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background-surface">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-text-primary">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-text-secondary">Research Tools</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-accent">TradingCopilot</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr key={row.feature} className={i !== comparison.length - 1 ? 'border-b border-border/50' : ''}>
                    <td className="px-6 py-4 text-sm text-text-primary">{row.feature}</td>
                    <td className="px-6 py-4 text-center">
                      {row.others ? (
                        <CheckCircle2 className="mx-auto h-5 w-5 text-bull" />
                      ) : (
                        <X className="mx-auto h-5 w-5 text-text-muted" />
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CheckCircle2 className="mx-auto h-5 w-5 text-accent" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* Live Demo Section */}
      <section className="py-20 lg:py-32 bg-background-surface">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <motion.div
            {...fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl lg:text-5xl">
              See It In Action
            </h2>
            <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
              Real example of how our AI analyzes and provides actionable verdicts
            </p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-4xl"
          >
            <div className="rounded-xl border border-border bg-background-card p-8 shadow-xl">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                    <span className="text-sm text-accent font-bold">U</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-text-muted mb-1">You</div>
                    <div className="text-text-primary">Should I buy NVDA on this dip?</div>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-bull/20 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-bull" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="text-sm text-text-muted mb-1">TradingCopilot AI</div>
                    <div className="space-y-3 text-text-primary">
                      <div>
                        <Badge className="bg-warning text-background mb-2">VERDICT: WAIT</Badge>
                      </div>
                      <div className="text-sm space-y-2 text-text-secondary">
                        <p><strong className="text-text-primary">Current Setup:</strong> NVDA at $190.04 (after-hours, +2.5% gap up). This isn't actually a dip - it's trading near session highs.</p>
                        <p><strong className="text-text-primary">Key Levels:</strong> Resistance at $190-195 (gamma wall), Support at $182-185.</p>
                        <p><strong className="text-text-primary">Risk Factors:</strong> CRISIS conditions detected in news. Dealers are long gamma, creating mean reversion dynamics.</p>
                        <p><strong className="text-bull">Better Entry:</strong> Wait for pullback to $182-185 support zone, or for crisis concerns to clear.</p>
                        <p><strong className="text-bear">Invalidates:</strong> Close below $180 would be bearish signal.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 lg:py-32 bg-background">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <motion.div
            {...fadeInUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl lg:text-5xl">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
              Start free. Upgrade when you're ready.
            </p>
          </motion.div>
          
          <motion.div
            variants={staggerChildren}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
            className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-3"
          >
            {/* Sort tiers: Most Popular first on mobile */}
            {[...tiers].sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0)).map((tier) => (
              <motion.div
                key={tier.name}
                variants={fadeInUp}
                className={`relative rounded-xl border ${
                  tier.popular 
                    ? 'border-accent bg-gradient-to-b from-accent/10 to-transparent shadow-lg shadow-accent/10' 
                    : 'border-border bg-background-card'
                } p-8`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-accent text-background">Most Popular</Badge>
                  </div>
                )}
                
                <h3 className="text-xl font-semibold text-text-primary">{tier.name}</h3>
                <p className="mt-1 text-sm text-text-secondary">{tier.description}</p>
                
                <div className="mt-6 flex items-baseline">
                  <span className="text-5xl font-bold text-text-primary">{tier.price}</span>
                  {tier.period && <span className="ml-2 text-text-muted">{tier.period}</span>}
                </div>
                
                <ul className="mt-8 space-y-4">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="h-5 w-5 flex-shrink-0 text-accent mt-0.5" />
                      <span className="text-sm text-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button
                  className="mt-8 w-full min-h-[48px]"
                  variant={tier.popular ? 'default' : 'outline'}
                  size="lg"
                  asChild
                >
                  <Link href={tier.href}>{tier.cta}</Link>
                </Button>

                {/* Trust Badges */}
                {tier.name === 'Free' && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-2 text-xs text-[#6b7a99]">
                      <CheckCircle className="h-3 w-3" />
                      <span>No credit card required</span>
                    </div>
                  </div>
                )}
                {tier.name !== 'Free' && (
                  <div className="mt-4 pt-4 border-t border-border space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[#6b7a99]">
                      <CheckCircle className="h-3 w-3" />
                      <span>Cancel anytime</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#6b7a99]">
                      <CheckCircle className="h-3 w-3" />
                      <span>30-day money-back guarantee</span>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>

          {/* Pricing Comparison Context */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-12 text-center"
          >
            <p className="text-[13px] text-[#4a5568]">
              For context: Bloomberg Terminal costs $24,000/yr · SpotGamma Alpha costs $249/mo · FlowAlgo costs $228/mo
            </p>
          </motion.div>
        </div>
      </section>

      {/* Testimonials Section */}
      <Testimonials />

      {/* Final CTA Section */}
      <section className="py-20 lg:py-32 bg-background-surface">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/10 via-transparent to-accent/10 p-12 text-center lg:p-16"
          >
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl lg:text-5xl">
              Ready to trade smarter?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
              Try our AI for free. 3 questions per day, no credit card required.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="xl" asChild className="text-lg px-8 py-6">
                <Link href="/ask">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Start Free
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild className="text-lg px-8 py-6">
                <Link href="/pricing">View Pricing</Link>
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-[#6b7a99]">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Cancel anytime</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>30-day money-back guarantee</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
      </div>
    </MarketPulseProvider>
  );
}
