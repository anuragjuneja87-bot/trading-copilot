'use client';

import { useState, useEffect } from 'react';

type MarketSession = 'pre-market' | 'open' | 'after-hours' | 'closed';

interface SessionConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}

const SESSION_CONFIG: Record<MarketSession, SessionConfig> = {
  'pre-market': {
    label: 'Pre-Market',
    color: '#fbbf24',
    bgColor: 'rgba(251, 191, 36, 0.1)',
    icon: '🌅',
  },
  'open': {
    label: 'Market Open',
    color: '#00e676',
    bgColor: 'rgba(0, 230, 118, 0.1)',
    icon: '🟢',
  },
  'after-hours': {
    label: 'After-Hours',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    icon: '🌙',
  },
  'closed': {
    label: 'Closed',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: '🔴',
  },
};

function getMarketSession(): MarketSession {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  
  if (day === 0 || day === 6) return 'closed';
  
  const timeInMinutes = hour * 60 + minute;
  
  if (timeInMinutes >= 240 && timeInMinutes < 570) return 'pre-market';
  else if (timeInMinutes >= 570 && timeInMinutes < 960) return 'open';
  else if (timeInMinutes >= 960 && timeInMinutes < 1200) return 'after-hours';
  else return 'closed';
}

export function MarketClock() {
  const [time, setTime] = useState<string>('');
  const [session, setSession] = useState<MarketSession>('closed');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const etTime = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setTime(etTime);
      setSession(getMarketSession());
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const config = SESSION_CONFIG[session];

  return (
    <div 
      className="flex items-center gap-2.5 px-4 py-2 rounded-xl transition-colors"
      style={{ 
        background: config.bgColor,
        border: `1px solid ${config.color}20`,
      }}
    >
      {/* Pulse indicator */}
      <div className="relative flex-shrink-0">
        <div 
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: config.color }}
        />
        {session === 'open' && (
          <div 
            className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping"
            style={{ background: config.color, opacity: 0.5 }}
          />
        )}
      </div>
      
      {/* Time - BIGGER */}
      <span 
        className="font-mono text-base font-black tabular-nums tracking-wide"
        style={{ color: config.color, fontFamily: "'Oxanium', 'JetBrains Mono', monospace" }}
      >
        {time || '--:--:--'}
      </span>
      
      <span 
        className="text-xs font-bold"
        style={{ color: config.color, opacity: 0.7 }}
      >
        ET
      </span>
      
      {/* Divider */}
      <div className="w-px h-5 bg-white/10" />
      
      {/* Session badge */}
      <span 
        className="text-sm font-bold"
        style={{ color: config.color }}
      >
        {config.icon} {config.label}
      </span>
    </div>
  );
}
