'use client';

import { motion } from 'framer-motion';
import { useInView } from '@/hooks/useInView';
import { Quote } from 'lucide-react';

// TODO: Replace with real testimonials from actual users
const testimonials = [
  {
    quote: 'The CRISIS detection alone has saved me from three bad entries this month. Worth 10x the price.',
    author: 'Michael R.',
    role: 'Day Trader',
  },
  {
    quote: 'I was paying $249/mo for SpotGamma Alpha. This gives me more actionable signals for a fraction of the cost.',
    author: 'Sarah K.',
    role: 'Options Scalper',
  },
  {
    quote: 'The AI verdicts are scary good. It told me to WAIT on NVDA at open, and I would have lost $2K if I\'d entered.',
    author: 'James T.',
    role: 'Swing Trader',
  },
];

export function Testimonials() {
  const { ref, isInView } = useInView({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-20 lg:py-32 bg-background">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-bold text-text-primary sm:text-4xl lg:text-5xl mb-4">
            Trusted by Traders
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            See what real traders are saying about TradingCopilot
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: index * 0.15, duration: 0.5 }}
              className="relative rounded-xl border border-[rgba(255,255,255,0.1)] bg-background-card p-6"
              style={{ borderLeft: '3px solid #00e5ff' }}
            >
              <Quote className="h-5 w-5 text-[#00e5ff] mb-3 opacity-50" />
              <p className="text-sm italic text-[#8b99b0] leading-relaxed mb-4" style={{ fontSize: '14px' }}>
                "{testimonial.quote}"
              </p>
              <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                <div className="text-xs font-semibold text-white">{testimonial.author}</div>
                <div className="text-xs text-[#6b7a99] mt-0.5">{testimonial.role}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
