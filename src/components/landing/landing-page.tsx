'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { YodhaLogo, YodhaWordmark } from '@/components/brand/yodha-logo';
import { 
  Shield, Activity, Building2, BarChart3, 
  Zap, Eye, Brain, ChevronRight, ArrowRight,
  TrendingUp, Lock, Sparkles
} from 'lucide-react';

const FEATURES = [
  {
    icon: Activity,
    title: 'Live Options Flow',
    desc: 'Track real-time call/put flow, sweep detection, and delta-adjusted premium. See what smart money is buying before the move happens.',
    color: '#00e5ff',
  },
  {
    icon: Building2,
    title: 'Dark Pool Detection',
    desc: 'Institutional block trades surfaced in real-time. Know when the big players are accumulating or distributing — before price reacts.',
    color: '#7c4dff',
  },
  {
    icon: BarChart3,
    title: 'Gamma & Key Levels',
    desc: 'GEX flip points, call walls, put walls, and max pain. Understand where dealers will amplify or dampen your move.',
    color: '#00e676',
  },
  {
    icon: Brain,
    title: 'AI Thesis Engine',
    desc: 'Every signal synthesized into a clear BULLISH / BEARISH / NEUTRAL verdict. Four sub-theses — flow, dark pool, news, relative strength — in one view.',
    color: '#ff9800',
  },
];

const STATS = [
  { value: '< 2s', label: 'Data Latency' },
  { value: '4', label: 'AI Sub-Theses' },
  { value: '6', label: 'Panel Types' },
  { value: '24/5', label: 'Market Coverage' },
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="min-h-screen" style={{ background: '#060810' }}>
      {/* NAV */}
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
          <div className="flex items-center gap-4">
            <Link 
              href="/ask" 
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105"
              style={{ 
                background: 'linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%)',
                color: '#060810',
              }}
            >
              Enter Yodha Room
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.04]"
            style={{ background: 'radial-gradient(circle, #00e5ff, transparent 70%)' }} />
          <div className="absolute top-40 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.03]"
            style={{ background: 'radial-gradient(circle, #7c4dff, transparent 70%)' }} />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />
        </div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)' }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: '#00e5ff' }} />
            <span className="text-xs font-semibold" style={{ color: '#00e5ff' }}>AI-Powered Trading Intelligence</span>
          </div>
          
          {/* Main headline */}
          <h1 
            className={`text-5xl sm:text-6xl md:text-7xl font-black leading-[1.05] mb-6 tracking-tight transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            style={{ fontFamily: "'Oxanium', 'JetBrains Mono', monospace" }}
          >
            <span className="text-white">Your AI </span>
            <span style={{ 
              background: 'linear-gradient(135deg, #00e5ff 0%, #7c4dff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Trading Warrior</span>
          </h1>
          
          {/* Subheadline */}
          <p className={`text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            See what Wall Street sees. Real-time options flow, dark pool prints, gamma levels, and AI-synthesized verdicts — all in one command center.
            <span className="block mt-2 text-gray-500 text-base italic">
              Yodha (योद्धा) — warrior, one who fights with intelligence.
            </span>
          </p>
          
          {/* CTA */}
          <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <Link 
              href="/ask"
              className="group flex items-center gap-3 px-8 py-4 rounded-xl text-base font-bold transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(0,229,255,0.3)]"
              style={{ 
                background: 'linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%)',
                color: '#060810',
              }}
            >
              <Shield className="w-5 h-5" />
              Enter the Yodha Room
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <span className="text-sm text-gray-500 flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Free during beta
            </span>
          </div>
          
          {/* Stats row */}
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto transition-all duration-700 delay-[400ms] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-2xl font-black text-white" style={{ fontFamily: "'Oxanium', monospace" }}>{stat.value}</div>
                <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SCREENSHOT / PREVIEW - dark panel suggestion */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl overflow-hidden" style={{ 
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 0 80px rgba(0,229,255,0.05)',
          }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="ml-3 text-xs text-gray-500 font-mono">tradeyodha.com/ask?symbol=NVDA</span>
            </div>
            <div className="p-8 text-center">
              <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Mock panels */}
                <MockPanel title="OPTIONS FLOW" badge="BULLISH" badgeColor="#00e676">
                  <div className="flex items-end gap-1 h-16 mt-3">
                    {[30, 45, 35, 60, 50, 70, 55, 80, 65, 90].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i < 7 ? 'rgba(0,230,118,0.3)' : 'rgba(0,229,255,0.4)' }} />
                    ))}
                  </div>
                </MockPanel>
                <MockPanel title="DARK POOL" badge="ACCUMULATION" badgeColor="#7c4dff">
                  <div className="flex items-center justify-center h-16 mt-3 gap-3">
                    <div className="text-2xl font-black text-white font-mono">$12.4M</div>
                    <div className="text-xs text-green-400 font-bold">72% Bull</div>
                  </div>
                </MockPanel>
                <MockPanel title="GAMMA LEVELS" badge="+$8K GEX" badgeColor="#ff9800">
                  <div className="flex items-center h-16 mt-3 gap-1">
                    {[-8, -5, -3, 2, 6, 12, 8, 4, -2, -4].map((v, i) => (
                      <div key={i} className="flex-1 rounded" style={{ 
                        height: `${Math.abs(v) * 6}%`, 
                        background: v >= 0 ? 'rgba(0,230,118,0.4)' : 'rgba(255,82,82,0.4)',
                        alignSelf: v >= 0 ? 'flex-end' : 'flex-start',
                      }} />
                    ))}
                  </div>
                </MockPanel>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4" style={{ color: '#00e5ff' }} />
                  <span className="text-xs font-bold text-white">AI THESIS</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400">BULLISH</span>
                </div>
                <p className="text-sm text-gray-400 text-left">
                  NVDA at $187.96 (+1.62%). Call-heavy flow (89%) with institutional sweep activity. Dark pool shows accumulation pattern ($12.4M, 72% bullish). 
                  Outperforming SPY by +0.94%. Bullish alignment across flow, dark pool, and relative strength.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="px-6 py-20" id="features">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: "'Oxanium', monospace" }}>
              Four Weapons. One Verdict.
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Every panel feeds the AI thesis engine. Stop guessing. Start seeing the full picture.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div 
                  key={feature.title}
                  className="group p-6 rounded-2xl transition-all duration-300 hover:translate-y-[-2px]"
                  style={{ 
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${feature.color}15` }}>
                      <Icon className="w-5 h-5" style={{ color: feature.color }} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white mb-2">{feature.title}</h3>
                      <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-6 py-20 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: "'Oxanium', monospace" }}>
              How It Works
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Pick Your Symbol', desc: 'Enter any ticker. SPY, QQQ, NVDA, AAPL — your watchlist, your battlefield.', icon: Eye },
              { step: '02', title: 'See Everything', desc: 'Six panels light up: options flow, dark pool, gamma levels, volume pressure, relative strength, and news sentiment.', icon: Activity },
              { step: '03', title: 'Get the Verdict', desc: 'The AI thesis engine synthesizes all signals into a clear directional bias with confidence scoring.', icon: TrendingUp },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                    style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.15)' }}>
                    <Icon className="w-6 h-6" style={{ color: '#00e5ff' }} />
                  </div>
                  <div className="text-xs font-bold mb-2" style={{ color: '#00e5ff', fontFamily: "'Oxanium', monospace" }}>STEP {item.step}</div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-400">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <YodhaLogo size={64} className="mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: "'Oxanium', monospace" }}>
            Ready to Trade Like a Yodha?
          </h2>
          <p className="text-gray-400 mb-8 max-w-lg mx-auto">
            Join traders who stopped guessing and started seeing the full picture. Free during beta.
          </p>
          <Link 
            href="/ask"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl text-base font-bold transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(0,229,255,0.3)]"
            style={{ 
              background: 'linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%)',
              color: '#060810',
            }}
          >
            <Shield className="w-5 h-5" />
            Enter the Yodha Room
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
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

function MockPanel({ title, badge, badgeColor, children }: { title: string; badge: string; badgeColor: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 text-left" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${badgeColor}20`, color: badgeColor }}>{badge}</span>
      </div>
      {children}
    </div>
  );
}
