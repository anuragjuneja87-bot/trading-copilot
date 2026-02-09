'use client';

import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Zap, Crown, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

const tiers = [
  {
    name: 'Free',
    icon: Zap,
    price: '$0',
    period: '',
    description: 'Try before you commit',
    features: [
      { text: '3 AI questions per day', included: true },
      { text: 'Delayed options flow (30 min)', included: true },
      { text: '5 watchlist tickers', included: true },
      { text: 'Basic key levels', included: true },
      { text: 'Real-time flow', included: false },
      { text: 'Dark pool prints', included: false },
      { text: 'Alerts', included: false },
      { text: 'API access', included: false },
    ],
    cta: 'Start Free',
    href: '/signup',
    popular: false,
    color: 'text-text-secondary',
    borderColor: 'border-border',
  },
  {
    name: 'Pro',
    icon: Crown,
    price: '$29',
    period: '/month',
    annualPrice: '$290/year',
    annualSavings: 'Save $58',
    description: 'For active traders',
    features: [
      { text: '100 AI questions per day', included: true },
      { text: 'Real-time options flow', included: true },
      { text: '15 watchlist tickers', included: true },
      { text: 'Full key levels + gamma', included: true },
      { text: 'Dark pool prints', included: true },
      { text: 'In-app alerts', included: true },
      { text: 'Morning briefing', included: true },
      { text: 'API access', included: false },
    ],
    cta: 'Subscribe',
    href: '/signup?plan=pro',
    popular: true,
    color: 'text-accent',
    borderColor: 'border-accent',
  },
  {
    name: 'Elite',
    icon: Rocket,
    price: '$79',
    period: '/month',
    annualPrice: '$790/year',
    annualSavings: 'Save $158',
    description: 'For serious traders',
    features: [
      { text: 'Unlimited AI questions', included: true },
      { text: 'Real-time everything', included: true },
      { text: '50 watchlist tickers', included: true },
      { text: 'Full key levels + gamma', included: true },
      { text: 'Dark pool prints', included: true },
      { text: 'SMS + push alerts', included: true },
      { text: 'Priority morning briefing', included: true },
      { text: 'Full API access', included: true },
    ],
    cta: 'Subscribe',
    href: '/signup?plan=elite',
    popular: false,
    color: 'text-warning',
    borderColor: 'border-warning',
  },
];

const faqs = [
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes, you can cancel your subscription at any time. You\'ll continue to have access until the end of your billing period.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, Mastercard, American Express) and PayPal through our secure Stripe payment processor.',
  },
  {
    question: 'Is there a free trial for paid plans?',
    answer: 'The free tier lets you try the AI with 3 questions per day. We don\'t offer trials on paid plans, but you can cancel within 7 days for a full refund.',
  },
  {
    question: 'What\'s included in the AI questions?',
    answer: 'Each AI question can be about any ticker, market conditions, or trading setup. You get a full analysis with verdict, levels, and reasoning — not just a simple answer.',
  },
  {
    question: 'How is the options flow data sourced?',
    answer: 'We use Polygon.io for real-time market data, combined with proprietary algorithms to filter and highlight unusual activity, sweeps, and high-conviction trades.',
  },
  {
    question: 'Can I upgrade or downgrade my plan?',
    answer: 'Yes, you can change your plan at any time. Upgrades take effect immediately, and downgrades take effect at the start of your next billing period.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-20">
        {/* Hero */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 text-center">
            <Badge variant="default" className="mb-4">
              Simple Pricing
            </Badge>
            <h1 className="text-4xl font-bold text-text-primary sm:text-5xl">
              Choose your trading edge
            </h1>
            <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
              Start free. Upgrade when you need more. All plans include our AI trading copilot.
            </p>
          </div>
        </section>

        {/* Pricing cards */}
        <section className="pb-16 lg:pb-24">
          <div className="mx-auto max-w-7xl px-4">
            <div className="grid gap-8 lg:grid-cols-3 lg:gap-6">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className={cn(
                    'relative rounded-2xl border bg-background-card p-8 flex flex-col',
                    tier.popular ? tier.borderColor : 'border-border',
                    tier.popular && 'ring-2 ring-accent/50'
                  )}
                >
                  {/* Popular badge */}
                  {tier.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <Badge variant="default" className="px-4 py-1">
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  {/* Header */}
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={cn(
                        'h-10 w-10 rounded-lg flex items-center justify-center',
                        tier.popular ? 'bg-accent/10' : 'bg-background-elevated'
                      )}>
                        <tier.icon className={cn('h-5 w-5', tier.color)} />
                      </div>
                      <h3 className="text-xl font-semibold text-text-primary">
                        {tier.name}
                      </h3>
                    </div>
                    <p className="text-sm text-text-secondary">{tier.description}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold text-text-primary">
                        {tier.price}
                      </span>
                      {tier.period && (
                        <span className="ml-1 text-text-muted">{tier.period}</span>
                      )}
                    </div>
                    {tier.annualPrice && (
                      <p className="mt-1 text-sm text-text-secondary">
                        or {tier.annualPrice}{' '}
                        <span className="text-bull">({tier.annualSavings})</span>
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="mb-8 space-y-3 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature.text} className="flex items-start gap-3">
                        {feature.included ? (
                          <Check className="h-5 w-5 text-bull flex-shrink-0 mt-0.5" />
                        ) : (
                          <X className="h-5 w-5 text-text-muted flex-shrink-0 mt-0.5" />
                        )}
                        <span className={cn(
                          'text-sm',
                          feature.included ? 'text-text-primary' : 'text-text-muted'
                        )}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Button
                    className="w-full"
                    variant={tier.popular ? 'default' : 'outline'}
                    size="lg"
                    asChild
                  >
                    <Link href={tier.href}>{tier.cta}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature comparison table */}
        <section className="py-16 lg:py-24 bg-background-surface">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold text-text-primary text-center mb-12">
              Detailed Feature Comparison
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-4 pr-4 text-sm font-medium text-text-secondary">
                      Feature
                    </th>
                    {tiers.map((tier) => (
                      <th key={tier.name} className={cn(
                        'text-center py-4 px-4 text-sm font-medium',
                        tier.popular ? 'text-accent' : 'text-text-secondary'
                      )}>
                        {tier.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <FeatureRow 
                    feature="AI Questions" 
                    values={['3/day', '100/day', 'Unlimited']} 
                  />
                  <FeatureRow 
                    feature="Options Flow" 
                    values={['30 min delay', 'Real-time', 'Real-time']} 
                  />
                  <FeatureRow 
                    feature="Dark Pool Prints" 
                    values={[false, true, true]} 
                  />
                  <FeatureRow 
                    feature="Watchlist Size" 
                    values={['5', '15', '50']} 
                  />
                  <FeatureRow 
                    feature="Key Levels" 
                    values={['Basic', 'Full + Gamma', 'Full + Gamma']} 
                  />
                  <FeatureRow 
                    feature="Morning Briefing" 
                    values={[false, true, 'Priority']} 
                  />
                  <FeatureRow 
                    feature="Alerts" 
                    values={[false, 'In-app', 'SMS + Push']} 
                  />
                  <FeatureRow 
                    feature="API Access" 
                    values={[false, false, true]} 
                  />
                  <FeatureRow 
                    feature="Support" 
                    values={['Community', 'Email', 'Priority']} 
                  />
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-2xl font-bold text-text-primary text-center mb-12">
              Frequently Asked Questions
            </h2>
            
            <div className="space-y-6">
              {faqs.map((faq) => (
                <div 
                  key={faq.question}
                  className="rounded-lg border border-border bg-background-card p-6"
                >
                  <h3 className="text-base font-medium text-text-primary mb-2">
                    {faq.question}
                  </h3>
                  <p className="text-sm text-text-secondary">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 lg:py-24 bg-background-surface">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Ready to trade smarter?
            </h2>
            <p className="text-text-secondary mb-8">
              Join thousands of traders using AI-powered insights to make better decisions.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="xl" asChild>
                <Link href="/signup">Get Started Free</Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <Link href="/ask">Try AI Demo</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
}

function FeatureRow({ 
  feature, 
  values 
}: { 
  feature: string; 
  values: (string | boolean)[];
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-4 pr-4 text-sm text-text-primary">{feature}</td>
      {values.map((value, i) => (
        <td key={i} className="text-center py-4 px-4">
          {typeof value === 'boolean' ? (
            value ? (
              <Check className="h-5 w-5 text-bull mx-auto" />
            ) : (
              <X className="h-5 w-5 text-text-muted mx-auto" />
            )
          ) : (
            <span className={cn(
              'text-sm',
              i === 1 ? 'text-accent font-medium' : 'text-text-secondary'
            )}>
              {value}
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}
