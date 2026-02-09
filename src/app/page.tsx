import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Zap, 
  AlertTriangle, 
  BarChart3, 
  Sun, 
  Target,
  Shield,
  Clock,
  TrendingUp,
  MessageSquare,
  Check,
  ArrowRight
} from 'lucide-react';

// Feature cards data
const features = [
  {
    icon: Target,
    title: 'Verdicts, Not Data',
    description: 'BUY, SELL, or WAIT with specific levels, targets, and invalidation criteria. Not just charts and numbers.',
  },
  {
    icon: AlertTriangle,
    title: 'Crisis Detection',
    description: '18 keywords monitored 24/7. Automatic mode switching when markets enter crisis. Never caught off guard.',
  },
  {
    icon: BarChart3,
    title: 'Options Microstructure',
    description: 'Gamma walls, dealer positioning, unusual flow. See where the real levels are, not just technical lines.',
  },
  {
    icon: Sun,
    title: 'Morning Briefing',
    description: 'Pre-market synthesis generated automatically at 7 AM. Know what matters before you trade.',
  },
];

// Comparison data
const comparison = [
  { feature: 'Shows options flow', others: true, us: true },
  { feature: 'Tells you what to DO', others: false, us: true },
  { feature: 'AI chat with verdicts', others: false, us: true },
  { feature: 'Crisis detection', others: false, us: true },
  { feature: 'Gamma levels', others: false, us: true },
  { feature: 'Session awareness', others: false, us: true },
  { feature: 'Morning briefing', others: false, us: true },
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
      '5 watchlist tickers',
      'Basic key levels',
    ],
    cta: 'Start Free',
    href: '/signup',
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
    href: '/signup?plan=pro',
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
    href: '/signup?plan=elite',
    popular: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 pb-16 lg:pt-32 lg:pb-24">
        {/* Background pattern */}
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        
        <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
          <div className="text-center">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-1.5">
              <Zap className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium text-accent">AI-Powered Trading Intelligence</span>
            </div>
            
            {/* Headline */}
            <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              Stop staring at options flow.
              <br />
              <span className="gradient-text">Start getting answers.</span>
            </h1>
            
            {/* Subheadline */}
            <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
              The AI trading copilot that tells you <strong className="text-text-primary">WHAT TO DO</strong>, 
              not just what happened. Real-time verdicts with levels, targets, and invalidation criteria.
            </p>
            
            {/* CTA buttons */}
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="xl" asChild>
                <Link href="/ask">
                  Try Free AI Chat
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <Link href="/pricing">See Pricing</Link>
              </Button>
            </div>
          </div>
          
          {/* Demo terminal */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="rounded-xl border border-border bg-background-card shadow-2xl overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center gap-2 border-b border-border bg-background-surface px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-bear" />
                  <div className="h-3 w-3 rounded-full bg-warning" />
                  <div className="h-3 w-3 rounded-full bg-bull" />
                </div>
                <span className="ml-2 text-xs text-text-muted font-mono">TradingCopilot AI</span>
              </div>
              
              {/* Terminal content */}
              <div className="p-6 font-mono text-sm">
                {/* User message */}
                <div className="mb-4 flex gap-3">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center">
                    <span className="text-xs text-accent">U</span>
                  </div>
                  <div className="text-text-primary">
                    Should I buy NVDA on this dip?
                  </div>
                </div>
                
                {/* AI response */}
                <div className="flex gap-3">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-bull/20 flex items-center justify-center">
                    <Zap className="h-3 w-3 text-bull" />
                  </div>
                  <div className="space-y-3">
                    <div className="text-text-secondary">
                      <span className="text-warning font-semibold">📊 NVDA DIP ANALYSIS</span>
                    </div>
                    <div>
                      <Badge variant="wait" className="text-sm">VERDICT: WAIT</Badge>
                    </div>
                    <div className="space-y-1 text-text-secondary">
                      <p><span className="text-bear">•</span> Gamma wall at <span className="text-text-primary">$140</span> acting as magnet</p>
                      <p><span className="text-bear">•</span> News: Fed uncertainty <span className="text-warning">(ELEVATED)</span></p>
                      <p><span className="text-bear">•</span> Flow: Mixed — calls + protective puts</p>
                    </div>
                    <div className="text-text-secondary">
                      <p><span className="text-bull">Entry if:</span> <span className="text-text-primary">Break above $142 with volume</span></p>
                      <p><span className="text-bear">Invalidates:</span> <span className="text-text-primary">Close below $138</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="py-16 lg:py-24 bg-background-surface">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl">
              What makes us different
            </h2>
            <p className="mt-4 text-lg text-text-secondary">
              Not another data dashboard. An AI that actually helps you trade.
            </p>
          </div>
          
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-background-card p-6 transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                  <feature.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary">{feature.title}</h3>
                <p className="mt-2 text-sm text-text-secondary">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* Comparison Section */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl">
              Research tools vs. Trading copilot
            </h2>
            <p className="mt-4 text-lg text-text-secondary">
              Other tools show you data. We tell you what to do with it.
            </p>
          </div>
          
          <div className="mx-auto mt-12 max-w-2xl overflow-hidden rounded-xl border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background-surface">
                  <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-text-secondary">Others</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-accent">TradingCopilot</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr key={row.feature} className={i !== comparison.length - 1 ? 'border-b border-border/50' : ''}>
                    <td className="px-6 py-4 text-sm text-text-primary">{row.feature}</td>
                    <td className="px-6 py-4 text-center">
                      {row.others ? (
                        <Check className="mx-auto h-5 w-5 text-bull" />
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check className="mx-auto h-5 w-5 text-accent" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      
      {/* Pricing Section */}
      <section id="pricing" className="py-16 lg:py-24 bg-background-surface">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-text-secondary">
              Start free. Upgrade when you're ready.
            </p>
          </div>
          
          <div className="mx-auto mt-12 grid max-w-5xl gap-8 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl border ${
                  tier.popular 
                    ? 'border-accent bg-gradient-to-b from-accent/10 to-transparent' 
                    : 'border-border bg-background-card'
                } p-8`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="default">Most Popular</Badge>
                  </div>
                )}
                
                <h3 className="text-lg font-semibold text-text-primary">{tier.name}</h3>
                <p className="mt-1 text-sm text-text-secondary">{tier.description}</p>
                
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-bold text-text-primary">{tier.price}</span>
                  {tier.period && <span className="ml-1 text-text-muted">{tier.period}</span>}
                </div>
                
                <ul className="mt-6 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="h-5 w-5 flex-shrink-0 text-accent" />
                      <span className="text-sm text-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button
                  className="mt-8 w-full"
                  variant={tier.popular ? 'default' : 'outline'}
                  asChild
                >
                  <Link href={tier.href}>{tier.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/10 via-transparent to-accent/10 p-8 text-center lg:p-16">
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl">
              Ready to trade smarter?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
              Try our AI for free. 3 questions per day, no credit card required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="xl" asChild>
                <Link href="/ask">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Ask AI Now
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <Link href="/flow">View Free Flow</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      
      <Footer />
    </div>
  );
}
