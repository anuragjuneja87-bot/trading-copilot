'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { YodhaLogo, YodhaWordmark } from '@/components/brand/yodha-logo';
import {
  Shield, Activity, Building2, BarChart3,
  Zap, Eye, Brain, ChevronRight, ArrowRight,
  TrendingUp, Lock, Sparkles, Timer, Target,
  AlertTriangle, Check, X, MonitorSmartphone,
  Cpu, MessageSquare
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────
   SCROLL OBSERVER HOOK
   ────────────────────────────────────────────────────────── */

function useIntersection(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/* ──────────────────────────────────────────────────────────
   ANIMATED DATA TICKS (hero)
   ────────────────────────────────────────────────────────── */

function LiveDataAnimation() {
  const [ticks, setTicks] = useState<{ id: number; type: string; text: string; color: string }[]>([]);
  const counter = useRef(0);

  const DATA_ITEMS = [
    { type: 'FLOW', text: 'NVDA 195C sweep $2.4M', color: '#00e676' },
    { type: 'FLOW', text: 'AAPL 190P block $890K', color: '#ff5252' },
    { type: 'DP', text: 'Dark pool print $4.2M @ $189.50', color: '#7c4dff' },
    { type: 'FLOW', text: 'SPY 580C sweep $1.8M', color: '#00e676' },
    { type: 'GEX', text: 'GEX flip shifted to $192', color: '#ff9800' },
    { type: 'DP', text: 'Accumulation detected $188-190', color: '#7c4dff' },
    { type: 'ML', text: 'Move probability: 78% ▲', color: '#00e5ff' },
    { type: 'FLOW', text: 'QQQ 500C unusual activity', color: '#00e676' },
    { type: 'NEWS', text: 'NVDA: Analyst upgrade to $210', color: '#ffc107' },
    { type: 'ML', text: 'Direction: BULLISH (82% conf)', color: '#00e5ff' },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      const item = DATA_ITEMS[counter.current % DATA_ITEMS.length];
      setTicks(prev => [
        { id: Date.now(), ...item },
        ...prev.slice(0, 5),
      ]);
      counter.current++;
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-1.5 overflow-hidden h-[180px]">
      {ticks.map((tick, i) => (
        <div
          key={tick.id}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-500"
          style={{
            background: `${tick.color}08`,
            border: `1px solid ${tick.color}20`,
            opacity: 1 - i * 0.15,
            transform: `translateY(${i * 2}px)`,
          }}
        >
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${tick.color}20`, color: tick.color }}>
            {tick.type}
          </span>
          <span className="text-gray-300">{tick.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   THESIS CARD (hero)
   ────────────────────────────────────────────────────────── */

function ThesisCard() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="rounded-xl p-4 transition-all duration-700"
      style={{
        background: show ? 'rgba(0,229,255,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${show ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
        opacity: show ? 1 : 0.3,
        transform: show ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-4 h-4" style={{ color: '#00e5ff' }} />
        <span className="text-xs font-bold text-white uppercase tracking-wider">Yodha Analysis</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400">BULLISH</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full bg-green-400 transition-all duration-1000" style={{ width: show ? '78%' : '0%' }} />
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">
        NVDA showing 78% move probability. Heavy call accumulation at 195 strike with dark pool support at 188-190. Bullish setup above VWAP.
      </p>
      {show && (
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: 'Entry', value: '$189.82', color: '#00e5ff' },
            { label: 'Target 1', value: '$192.00', color: '#00e676' },
            { label: 'Target 2', value: '$195.00', color: '#00e676' },
            { label: 'Stop', value: '$188.00', color: '#ff5252' },
          ].map((l) => (
            <div key={l.label} className="text-center">
              <div className="text-[9px] text-gray-500 uppercase">{l.label}</div>
              <div className="text-xs font-mono font-bold" style={{ color: l.color }}>{l.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   SCROLLYTELLING STEPS (Act 3)
   ────────────────────────────────────────────────────────── */

const TRADE_STEPS = [
  {
    time: '9:32 AM',
    title: 'Unusual call flow detected on NVDA',
    desc: 'Heavy institutional sweep at the 195 strike — $2.4M in premium, above-ask fills.',
    icon: Zap,
    color: '#00e676',
    panel: 'OPTIONS FLOW',
  },
  {
    time: '9:33 AM',
    title: 'Dark pool accumulation confirmed at $188-190',
    desc: '3 large block prints totaling $12.4M, all at or above the midpoint.',
    icon: Building2,
    color: '#7c4dff',
    panel: 'DARK POOL',
  },
  {
    time: '9:34 AM',
    title: 'ML model detects 82% move probability',
    desc: 'LightGBM pipeline flags high-confidence bullish signal. Direction confidence: 82%.',
    icon: Cpu,
    color: '#00e5ff',
    panel: 'ML ENGINE',
  },
  {
    time: '9:34 AM',
    title: 'Yodha delivers the thesis',
    desc: 'All signals synthesized: institutional call buying + dark pool accumulation + bullish momentum. Entry above VWAP, targets at GEX flip and call wall.',
    icon: Shield,
    color: '#00e5ff',
    panel: 'YODHA ANALYSIS',
  },
  {
    time: '10:15 AM',
    title: 'NVDA hits $193.50 — thesis confirmed',
    desc: 'The move played out exactly as the data suggested. Yodha flagged it 43 minutes before the breakout.',
    icon: Target,
    color: '#00e676',
    panel: 'RESULT',
  },
];

function ScrollyStep({ step, index }: { step: typeof TRADE_STEPS[0]; index: number }) {
  const { ref, visible } = useIntersection(0.3);
  const Icon = step.icon;

  return (
    <div ref={ref} className="flex gap-6 items-start">
      {/* Timeline */}
      <div className="flex flex-col items-center flex-shrink-0 w-16">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500"
          style={{
            background: visible ? `${step.color}20` : 'rgba(255,255,255,0.03)',
            border: `1px solid ${visible ? `${step.color}40` : 'rgba(255,255,255,0.06)'}`,
            transform: visible ? 'scale(1)' : 'scale(0.8)',
          }}
        >
          <Icon className="w-5 h-5 transition-colors duration-500" style={{ color: visible ? step.color : '#333' }} />
        </div>
        {index < TRADE_STEPS.length - 1 && (
          <div className="w-px h-16 mt-2" style={{ background: visible ? `${step.color}30` : 'rgba(255,255,255,0.06)' }} />
        )}
      </div>

      {/* Content */}
      <div
        className="flex-1 pb-8 transition-all duration-500"
        style={{
          opacity: visible ? 1 : 0.2,
          transform: visible ? 'translateX(0)' : 'translateX(20px)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full font-mono" style={{ background: `${step.color}15`, color: step.color }}>
            {step.time}
          </span>
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{step.panel}</span>
        </div>
        <h4 className="text-base font-bold text-white mb-1">{step.title}</h4>
        <p className="text-sm text-gray-400 leading-relaxed">{step.desc}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   MARKET CLOCK CTA
   ────────────────────────────────────────────────────────── */

function MarketTimeCTA() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(i);
  }, []);

  // ET offset
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = et.getHours();
  const m = et.getMinutes();
  const isOpen = h >= 9 && (h < 16 || (h === 9 && m >= 30));
  const isPre = h >= 4 && h < 9;

  if (isOpen) return <>The market is live. See what Yodha sees.</>;
  if (isPre) return <>Pre-market is active. Get your edge before the open.</>;

  // Calculate hours to next open
  const nextOpen = new Date(et);
  if (h >= 16) nextOpen.setDate(nextOpen.getDate() + 1);
  nextOpen.setHours(9, 30, 0, 0);
  // Skip weekends
  while (nextOpen.getDay() === 0 || nextOpen.getDay() === 6) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }
  const hoursUntil = Math.ceil((nextOpen.getTime() - et.getTime()) / (1000 * 60 * 60));

  return <>The market opens in {hoursUntil} hours. Will you be ready?</>;
}

/* ──────────────────────────────────────────────────────────
   MAIN LANDING PAGE
   ────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const act2 = useIntersection(0.15);
  const act3 = useIntersection(0.1);
  const act4 = useIntersection(0.15);

  return (
    <div className="min-h-screen" style={{ background: '#060810' }}>
      {/* ── NAV ──────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b" style={{
        borderColor: 'rgba(255,255,255,0.06)',
        background: 'rgba(6,8,16,0.85)',
        backdropFilter: 'blur(16px)',
      }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <YodhaLogo size={36} />
            <YodhaWordmark className="text-xl" />
          </Link>
          <Link
            href="/ask"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%)', color: '#060810' }}
          >
            <span className="hidden sm:inline">Enter War Room</span>
            <span className="sm:hidden">War Room</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </nav>

      {/* ── ACT 1: THE HOOK ─────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden min-h-screen flex items-center">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.04]"
            style={{ background: 'radial-gradient(circle, #00e5ff, transparent 70%)' }} />
          <div className="absolute top-40 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.03]"
            style={{ background: 'radial-gradient(circle, #7c4dff, transparent 70%)' }} />
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />
        </div>

        <div className="max-w-6xl mx-auto relative z-10 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <div>
              <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)' }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: '#00e5ff' }} />
                <span className="text-xs font-semibold" style={{ color: '#00e5ff' }}>AI-Powered Trading Intelligence</span>
              </div>

              <h1
                className={`text-5xl sm:text-6xl font-black leading-[1.05] mb-6 tracking-tight transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
                style={{ fontFamily: "'Oxanium', 'JetBrains Mono', monospace" }}
              >
                <span className="text-white">Stop guessing.</span>
                <br />
                <span style={{
                  background: 'linear-gradient(135deg, #00e5ff 0%, #7c4dff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>Start seeing.</span>
              </h1>

              <p className={`text-lg text-gray-400 max-w-lg mb-8 leading-relaxed transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                TradeYodha reads options flow, dark pool activity, gamma levels, and market structure in real-time — then tells you exactly what matters.
              </p>

              <div className={`flex flex-col sm:flex-row items-start gap-4 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                <Link
                  href="/ask"
                  className="group flex items-center gap-3 px-8 py-4 rounded-xl text-base font-bold transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(0,229,255,0.3)]"
                  style={{ background: 'linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%)', color: '#060810' }}
                >
                  See it live
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <span className="text-sm text-gray-500 flex items-center gap-1.5 pt-3">
                  <Lock className="w-3 h-3" /> No signup required. Free during beta.
                </span>
              </div>
            </div>

            {/* Right: Live data animation + thesis card */}
            <div className={`transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
              <div className="rounded-2xl p-5 space-y-4" style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 0 80px rgba(0,229,255,0.05)',
              }}>
                <div className="flex items-center gap-2 px-1 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  <span className="ml-2 text-[10px] text-gray-600 font-mono">live data feed</span>
                </div>
                <LiveDataAnimation />
                <ThesisCard />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ACT 2: THE PAIN ─────────────────────────────── */}
      <section ref={act2.ref} className="px-6 py-24 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <div className="max-w-5xl mx-auto">
          <div className={`text-center mb-16 transition-all duration-700 ${act2.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: "'Oxanium', monospace" }}>
              You&apos;re trading with one eye closed.
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Scattered tools, delayed data, gut decisions. Sound familiar?
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Without Yodha */}
            <div
              className={`rounded-2xl p-6 transition-all duration-700 delay-100 ${act2.visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}
              style={{ background: 'rgba(255,82,82,0.04)', border: '1px solid rgba(255,82,82,0.15)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <X className="w-5 h-5 text-red-400" />
                <span className="text-sm font-bold text-red-400 uppercase tracking-wider">Trading Today</span>
              </div>
              <div className="space-y-3">
                {[
                  '6 browser tabs open',
                  'Delayed data across platforms',
                  'Manual synthesis of scattered signals',
                  'Gut decisions under time pressure',
                  '"I missed the move checking another screen"',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 mt-1.5 flex-shrink-0" />
                    <span className="text-sm text-gray-400">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* With Yodha */}
            <div
              className={`rounded-2xl p-6 transition-all duration-700 delay-200 ${act2.visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
              style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Check className="w-5 h-5" style={{ color: '#00e5ff' }} />
                <span className="text-sm font-bold uppercase tracking-wider" style={{ color: '#00e5ff' }}>Trading with Yodha</span>
              </div>
              <div className="space-y-3">
                {[
                  'One screen, everything synthesized',
                  'Real-time data updated every 30 seconds',
                  'ML-detected signals with confidence scoring',
                  'Clear thesis with entry, targets, and stops',
                  '"Yodha flagged the setup 10 minutes before the move"',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#00e5ff' }} />
                    <span className="text-sm text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ACT 3: THE PRODUCT (Scrollytelling) ──────────── */}
      <section ref={act3.ref} className="px-6 py-24 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <div className="max-w-3xl mx-auto">
          <div className={`text-center mb-16 transition-all duration-700 ${act3.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: "'Oxanium', monospace" }}>
              How Yodha reads a trade
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              From scattered data to a clear thesis in 2 minutes. Here&apos;s how it works on a real setup.
            </p>
          </div>

          {/* Timeline */}
          <div className="pl-2">
            {TRADE_STEPS.map((step, i) => (
              <ScrollyStep key={i} step={step} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── ACT 4: THE PROOF ────────────────────────────── */}
      <section ref={act4.ref} className="px-6 py-24 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <div className="max-w-5xl mx-auto">
          <div className={`text-center mb-16 transition-all duration-700 ${act4.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: "'Oxanium', monospace" }}>
              What powers the analysis
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Activity,
                title: 'Real-time data engine',
                desc: 'Options flow, dark pool prints, gamma exposure, and relative strength — updated every 30 seconds during market hours.',
                color: '#00e5ff',
              },
              {
                icon: Brain,
                title: 'Machine learning models',
                desc: 'Trained on millions of market data points. Detects when a significant move is building before it happens.',
                color: '#7c4dff',
                stat: '59.4% win rate · 0.227 Sharpe',
              },
              {
                icon: MessageSquare,
                title: 'AI analyst',
                desc: 'Reads the data like a quant desk analyst. Delivers a thesis with specific entry, target, and risk levels.',
                color: '#00e676',
              },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className={`rounded-2xl p-6 transition-all duration-700`}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    transitionDelay: `${i * 150}ms`,
                    opacity: act4.visible ? 1 : 0,
                    transform: act4.visible ? 'translateY(0)' : 'translateY(20px)',
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${card.color}15` }}>
                    <Icon className="w-6 h-6" style={{ color: card.color }} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">{card.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{card.desc}</p>
                  {card.stat && (
                    <div className="mt-3 px-3 py-2 rounded-lg text-xs font-mono font-bold"
                      style={{ background: `${card.color}10`, color: card.color }}>
                      {card.stat}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── ACT 5: THE CTA ──────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <YodhaLogo size={64} className="mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: "'Oxanium', monospace" }}>
            <MarketTimeCTA />
          </h2>
          <p className="text-gray-400 mb-8 max-w-lg mx-auto">
            No credit card. No signup required. Just pick a ticker.
          </p>
          <Link
            href="/ask"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl text-base font-bold transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(0,229,255,0.3)]"
            style={{ background: 'linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%)', color: '#060810' }}
          >
            <Shield className="w-5 h-5" />
            Enter the War Room — Free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer className="px-6 py-8 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <YodhaLogo size={24} />
            <YodhaWordmark className="text-sm" />
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Terms</Link>
          </div>
          <p className="text-xs text-gray-600">© 2025 TradeYodha. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}
