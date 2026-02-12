'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Zap, ChevronDown, Loader2, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Price {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

interface RegimeData {
  status: 'normal' | 'elevated' | 'crisis';
  vixLevel: number;
}

export function Hero() {
  const [showTyping, setShowTyping] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  const [typedText, setTypedText] = useState('');

  // Fetch real-time data for metric cards
  const { data: pricesData } = useQuery<{ prices: Price[] }>({
    queryKey: ['prices', ['VIX']],
    queryFn: async () => {
      const res = await fetch('/api/market/prices?tickers=VIX');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000,
  });

  const { data: regime } = useQuery<RegimeData>({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 60000,
  });

  const vixPrice = pricesData?.prices?.find((p) => p.ticker === 'VIX');
  const vix = regime?.vixLevel || vixPrice?.price || 26.12;

  // Animation sequence
  useEffect(() => {
    const timer1 = setTimeout(() => setShowTyping(true), 1000);
    const timer2 = setTimeout(() => {
      setShowTyping(false);
      setShowResponse(true);
    }, 2500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  // Type out response when showResponse becomes true
  useEffect(() => {
    if (!showResponse) return;

    const responseText = `VERDICT: BUY\n\nSPY is trading at $692.53, up 0.06% in pre-market. Key levels:\n• Support: $690 (pivot)\n• Resistance: $695 (gamma wall)\n• Entry: $691-692\n• Target: $695-697\n• Stop: $688\n\nFlow is bullish (62% calls, $45M premium). Regime is NORMAL. Entry on any pullback to $691.`;
    let index = 0;
    const typeInterval = setInterval(() => {
      if (index < responseText.length) {
        setTypedText(responseText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
      }
    }, 15);

    return () => clearInterval(typeInterval);
  }, [showResponse]);

  const getRegimeLabel = (status?: string) => {
    switch (status) {
      case 'crisis':
        return 'CRISIS';
      case 'elevated':
        return 'ELEVATED';
      default:
        return 'NORMAL';
    }
  };

  const getRegimeColor = (status?: string) => {
    switch (status) {
      case 'crisis':
        return 'text-[#ff5252]';
      case 'elevated':
        return 'text-[#ffa726]';
      default:
        return 'text-[#00e676]';
    }
  };

  return (
    <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-24">
      {/* Background Effects */}
      <div className="absolute inset-0">
        {/* Radial gradient behind product preview */}
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(0,229,255,0.05) 0%, transparent 70%)' }}
        />
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-12 lg:gap-16 items-center text-center lg:text-left">
          {/* LEFT COLUMN - Copy */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6 w-full lg:w-auto"
          >
            {/* Eyebrow */}
            <div
              className="text-[11px] uppercase tracking-[2px] font-bold"
              style={{ color: '#00e5ff' }}
            >
              AI-POWERED OPTIONS INTELLIGENCE
            </div>

            {/* Headline */}
            <h1
              className="text-[32px] lg:text-[44px] font-extrabold text-white leading-[1.15] tracking-[-0.5px]"
              style={{ fontWeight: 800 }}
            >
              Stop staring at options flow.
              <br />
              Start getting answers.
            </h1>

            {/* Subheadline */}
            <p
              className="text-base text-[#8b99b0] leading-relaxed max-w-[480px]"
              style={{ lineHeight: 1.6 }}
            >
              The AI copilot that gives you BUY, SELL, or WAIT verdicts with specific levels, targets, and invalidation criteria. Not just data — decisions.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Link
                href="/pulse"
                className="rounded-[10px] text-base font-semibold text-[#0a0f1a] transition-all hover:scale-105 w-full sm:w-auto text-center"
                style={{
                  background: '#00e5ff',
                  padding: '14px 28px',
                  boxShadow: '0 0 30px rgba(0,229,255,0.3)',
                  minHeight: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                See Today's Market Pulse →
              </Link>
              <Link
                href="/ask"
                className="rounded-[10px] text-base font-medium text-white border border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.05)] transition-all w-full sm:w-auto text-center"
                style={{
                  padding: '14px 28px',
                  minHeight: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Try AI Free — No Signup
              </Link>
            </div>

            {/* Social Proof */}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-[13px] text-[#6b7a99]">
                Powered by ThetaData & Polygon.io · Trusted by 500+ traders
              </span>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center gap-4 pt-4 text-xs text-[#6b7a99]">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </motion.div>

          {/* RIGHT COLUMN - Product Preview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative w-full lg:w-auto"
            style={{ width: '90%', maxWidth: '100%' }}
          >
            {/* Browser/App Frame */}
            <div
              className="rounded-xl overflow-hidden border border-[rgba(255,255,255,0.1)]"
              style={{
                background: 'linear-gradient(180deg, #0d1321, #0a0f1a)',
                boxShadow: '0 20px 60px rgba(0,229,255,0.15), 0 0 0 1px rgba(0,229,255,0.1)',
              }}
            >
              {/* Top Bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.2)]">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#ff5252]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#ffa726]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#00e676]" />
                </div>
                <span className="ml-2 text-[10px] text-[#6b7a99] font-mono">TradingCopilot AI</span>
              </div>

              {/* Chat Content */}
              <div className="p-6 space-y-4 min-h-[320px] bg-[#0a0f1a]">
                {/* User Message */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex gap-3"
                >
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[rgba(0,229,255,0.2)] flex items-center justify-center">
                    <span className="text-xs text-[#00e5ff] font-bold">U</span>
                  </div>
                  <div className="text-sm text-white pt-1">
                    Should I buy SPY calls here?
                  </div>
                </motion.div>

                {/* Typing Indicator */}
                <AnimatePresence>
                  {showTyping && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex gap-3"
                    >
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[rgba(0,230,118,0.2)] flex items-center justify-center">
                        <Zap className="h-4 w-4 text-[#00e676]" />
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        <div className="h-2 w-2 rounded-full bg-[#00e676] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="h-2 w-2 rounded-full bg-[#00e676] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="h-2 w-2 rounded-full bg-[#00e676] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* AI Response */}
                <AnimatePresence>
                  {showResponse && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[rgba(0,230,118,0.2)] flex items-center justify-center">
                        <Zap className="h-4 w-4 text-[#00e676]" />
                      </div>
                      <div className="flex-1 space-y-3">
                        {/* Verdict Badge */}
                        <Badge
                          className="bg-[rgba(0,230,118,0.2)] text-[#00e676] border border-[#00e676]/30 text-xs px-3 py-1 font-semibold"
                        >
                          VERDICT: BUY
                        </Badge>

                        {/* Response Text */}
                        <div className="text-sm text-[#8b99b0] leading-relaxed">
                          {typedText.split('\n').map((line, idx) => {
                            if (line.startsWith('VERDICT:')) {
                              return null; // Already shown as badge
                            }
                            if (line.startsWith('•')) {
                              return (
                                <div key={idx} className="mt-1.5">
                                  <span className="text-[#00e676]">•</span> {line.substring(1).trim()}
                                </div>
                              );
                            }
                            if (line.trim()) {
                              return <div key={idx} className="mt-2">{line}</div>;
                            }
                            return <br key={idx} />;
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Real-time Metric Cards */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <motion.div
                key={vix}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.3)] p-3 backdrop-blur-sm"
              >
                <div className="text-[10px] text-[#6b7a99] uppercase tracking-wider mb-1">VIX</div>
                <motion.div
                  key={vix}
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  className="text-base font-mono font-bold text-white"
                >
                  {vix.toFixed(2)}
                </motion.div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.3)] p-3 backdrop-blur-sm"
              >
                <div className="text-[10px] text-[#6b7a99] uppercase tracking-wider mb-1">Gamma Wall</div>
                <div className="text-base font-mono font-bold text-white">$605</div>
              </motion.div>
              <motion.div
                key={regime?.status}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.3)] p-3 backdrop-blur-sm"
              >
                <div className="text-[10px] text-[#6b7a99] uppercase tracking-wider mb-1">Regime</div>
                <motion.div
                  key={regime?.status}
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  className={cn('text-base font-mono font-bold', getRegimeColor(regime?.status))}
                >
                  {getRegimeLabel(regime?.status)}
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.5 }}
          className="flex flex-col items-center gap-2 mt-16 lg:mt-20"
        >
          <span className="text-xs text-[#6b7a99] uppercase tracking-wider">Scroll to explore</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown className="h-5 w-5 text-[#6b7a99]" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
