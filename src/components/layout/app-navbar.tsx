'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useMarketSession } from '@/hooks/use-utils';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  Zap,
  Bell,
  ChevronDown,
  LogOut,
  Settings,
  LayoutDashboard,
} from 'lucide-react';

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

export function AppNavbar() {
  const { data: session } = useSession();
  const marketSession = useMarketSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Fetch regime data
  const { data: regime } = useQuery<RegimeData>({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 60000,
  });

  // Fetch key metrics
  const { data: pricesData } = useQuery<{ prices: Price[] }>({
    queryKey: ['prices', ['SPY', 'QQQ', 'VIX']],
    queryFn: async () => {
      const res = await fetch('/api/market/prices?tickers=SPY,QQQ,VIX');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000,
  });

  const getSessionLabel = (session: string) => {
    switch (session) {
      case 'pre-market':
        return 'PRE-MARKET';
      case 'market-open':
        return 'MARKET OPEN';
      case 'after-hours':
        return 'AFTER-HOURS';
      default:
        return 'CLOSED';
    }
  };

  // Get current ET time
  const etTime = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const spy = pricesData?.prices?.find((p) => p.ticker === 'SPY');
  const qqq = pricesData?.prices?.find((p) => p.ticker === 'QQQ');
  const vixPrice = pricesData?.prices?.find((p) => p.ticker === 'VIX');
  const vix = regime?.vixLevel || vixPrice?.price || 20;

  // Get user's first name
  const firstName = session?.user?.name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'User';
  const initials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : session?.user?.email?.[0]?.toUpperCase() || 'U';

  const tier = (session?.user as any)?.tier || 'FREE';
  const tierLabel = tier === 'FREE' ? 'FREE' : tier === 'PRO' ? 'PRO' : 'ELITE';

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  const isCrisis = regime?.status === 'crisis';
  const isNormal = regime?.status === 'normal';

  return (
    <header
      className="h-16 border-b flex items-center justify-between px-4 lg:px-6 relative z-50"
      style={{
        background: 'linear-gradient(180deg, #0a0f1a, #0d1321)',
        borderBottom: '1px solid rgba(0, 229, 255, 0.3)',
      }}
    >
      {/* LEFT SECTION - Logo */}
      <div className="flex items-center gap-2">
        <Link href="/app" className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[#00e5ff]" />
          <span className="text-base font-semibold" style={{ fontSize: '16px', fontWeight: 600 }}>
            <span className="text-white">Trading</span>
            <span className="text-[#00e5ff]">Copilot</span>
          </span>
        </Link>
      </div>

      {/* CENTER SECTION - Market Ticker Bar */}
      <div className="hidden md:flex items-center gap-0">
        {/* VIX */}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="flex flex-col">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: '#6b7a99', letterSpacing: '1px' }}
            >
              VIX
            </span>
            <span className="text-[13px] font-mono text-white">{vix.toFixed(2)}</span>
          </div>
          {vixPrice && vixPrice.changePercent !== 0 && (
            <Badge
              className={cn(
                'text-[10px] px-1.5 py-0.5',
                vixPrice.changePercent > 0
                  ? 'bg-[rgba(255,82,82,0.1)] text-[#ff5252]'
                  : 'bg-[rgba(0,230,118,0.1)] text-[#00e676]'
              )}
            >
              {vixPrice.changePercent > 0 ? '+' : ''}
              {vixPrice.changePercent.toFixed(2)}%
            </Badge>
          )}
        </div>

        <div className="h-8 w-px bg-[rgba(255,255,255,0.08)] mx-1" />

        {/* SPY */}
        {spy && (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5">
              <div className="flex flex-col">
                <span
                  className="text-[11px] uppercase tracking-wider"
                  style={{ color: '#6b7a99', letterSpacing: '1px' }}
                >
                  SPY
                </span>
                <span className="text-[13px] font-mono text-white">${spy.price.toFixed(2)}</span>
              </div>
              {spy.changePercent !== 0 && (
                <Badge
                  className={cn(
                    'text-[10px] px-1.5 py-0.5',
                    spy.changePercent > 0
                      ? 'bg-[rgba(0,230,118,0.1)] text-[#00e676]'
                      : 'bg-[rgba(255,82,82,0.1)] text-[#ff5252]'
                  )}
                >
                  {spy.changePercent > 0 ? '+' : ''}
                  {spy.changePercent.toFixed(2)}%
                </Badge>
              )}
            </div>
            <div className="h-8 w-px bg-[rgba(255,255,255,0.08)] mx-1" />
          </>
        )}

        {/* QQQ */}
        {qqq && (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5">
              <div className="flex flex-col">
                <span
                  className="text-[11px] uppercase tracking-wider"
                  style={{ color: '#6b7a99', letterSpacing: '1px' }}
                >
                  QQQ
                </span>
                <span className="text-[13px] font-mono text-white">${qqq.price.toFixed(2)}</span>
              </div>
              {qqq.changePercent !== 0 && (
                <Badge
                  className={cn(
                    'text-[10px] px-1.5 py-0.5',
                    qqq.changePercent > 0
                      ? 'bg-[rgba(0,230,118,0.1)] text-[#00e676]'
                      : 'bg-[rgba(255,82,82,0.1)] text-[#ff5252]'
                  )}
                >
                  {qqq.changePercent > 0 ? '+' : ''}
                  {qqq.changePercent.toFixed(2)}%
                </Badge>
              )}
            </div>
            <div className="h-8 w-px bg-[rgba(255,255,255,0.08)] mx-1" />
          </>
        )}

        {/* 10Y */}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="flex flex-col">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: '#6b7a99', letterSpacing: '1px' }}
            >
              10Y
            </span>
            <span className="text-[13px] font-mono text-white">—</span>
          </div>
        </div>

        {/* Regime Badge */}
        <div className="h-8 w-px bg-[rgba(255,255,255,0.08)] mx-2" />
        <div className="flex items-center gap-2 px-2">
          {isCrisis ? (
            <div className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full bg-[#ff5252] animate-pulse"
                style={{ animation: 'pulse 2s infinite' }}
              />
              <Badge
                className="text-[10px] font-bold uppercase px-2 py-0.5 border border-[#ff5252] bg-transparent text-[#ff5252]"
              >
                CRISIS
              </Badge>
            </div>
          ) : isNormal ? (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-[#00e676]" />
              <Badge className="text-[10px] font-bold uppercase px-2 py-0.5 border border-[#00e676] bg-transparent text-[#00e676]">
                NORMAL
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-[#ffa726]" />
              <Badge className="text-[10px] font-bold uppercase px-2 py-0.5 border border-[#ffa726] bg-transparent text-[#ffa726]">
                ELEVATED
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SECTION - Market Status + User */}
      <div className="flex items-center gap-3">
        {/* Market Status */}
        <div className="hidden lg:flex items-center gap-2 text-sm">
          <div
            className="h-2 w-2 rounded-full bg-[#00e676] animate-pulse"
            style={{ animation: 'pulse 2s infinite' }}
          />
          <span className="font-mono" style={{ color: '#6b7a99' }}>
            {getSessionLabel(marketSession)} {etTime} ET
          </span>
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button className="p-2 hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors">
            <Bell className="h-4 w-4" style={{ color: '#6b7a99' }} />
            <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#ff5252]" />
          </button>
        </div>

        <div className="h-8 w-px bg-[rgba(255,255,255,0.08)]" />

        {/* User Section */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors"
          >
            {/* Avatar */}
            <div
              className="h-8 w-8 rounded flex items-center justify-center text-white text-xs font-semibold"
              style={{
                background: 'linear-gradient(135deg, #00e5ff, #0097a7)',
              }}
            >
              {initials}
            </div>

            {/* Name + Tier */}
            <div className="flex flex-col items-start">
              <span className="text-xs text-white">{firstName}</span>
              {tier !== 'FREE' && (
                <span className="text-[9px]" style={{ color: '#6b7a99' }}>
                  {tierLabel}
                </span>
              )}
            </div>

            <ChevronDown className="h-3 w-3" style={{ color: '#6b7a99' }} />
          </button>

          {/* Dropdown Menu */}
          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              <div
                className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#0d1321] shadow-xl z-50"
                style={{ background: 'linear-gradient(180deg, #0d1321, #0a0f1a)' }}
              >
                <div className="p-1">
                  <Link
                    href="/app"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[rgba(255,255,255,0.05)] rounded transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Link>
                  <Link
                    href="/app/settings"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[rgba(255,255,255,0.05)] rounded transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                  <div className="h-px bg-[rgba(255,255,255,0.1)] my-1" />
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[rgba(255,255,255,0.05)] rounded transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Log Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
