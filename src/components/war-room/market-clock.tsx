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
    color: '#fbbf24', // yellow
    bgColor: 'rgba(251, 191, 36, 0.1)',
    icon: '🌅',
  },
  'open': {
    label: 'Market Open',
    color: '#00e676', // green
    bgColor: 'rgba(0, 230, 118, 0.1)',
    icon: '🟢',
  },
  'after-hours': {
    label: 'After-Hours',
    color: '#f97316', // orange
    bgColor: 'rgba(249, 115, 22, 0.1)',
    icon: '🌙',
  },
  'closed': {
    label: 'Closed',
    color: '#ef4444', // red
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: '🔴',
  },
};

function getMarketSession(): MarketSession {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Weekend = closed
  if (day === 0 || day === 6) return 'closed';
  
  const timeInMinutes = hour * 60 + minute;
  
  // Pre-market: 4:00 AM - 9:30 AM ET
  if (timeInMinutes >= 240 && timeInMinutes < 570) {
    return 'pre-market';
  }
  // Market open: 9:30 AM - 4:00 PM ET
  else if (timeInMinutes >= 570 && timeInMinutes < 960) {
    return 'open';
  }
  // After-hours: 4:00 PM - 8:00 PM ET
  else if (timeInMinutes >= 960 && timeInMinutes < 1200) {
    return 'after-hours';
  }
  // Closed: 8:00 PM - 4:00 AM ET
  else {
    return 'closed';
  }
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

    updateClock(); // Initial call
    const interval = setInterval(updateClock, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  const config = SESSION_CONFIG[session];

  return (
    <div 
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
      style={{ background: config.bgColor }}
    >
      {/* Pulse indicator */}
      <div className="relative">
        <div 
          className="w-2 h-2 rounded-full"
          style={{ background: config.color }}
        />
        {session === 'open' && (
          <div 
            className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
            style={{ background: config.color, opacity: 0.5 }}
          />
        )}
      </div>
      
      {/* Time */}
      <span 
        className="font-mono text-sm font-bold tabular-nums"
        style={{ color: config.color }}
      >
        {time || '--:--:--'}
      </span>
      
      {/* Session label */}
      <span 
        className="text-xs font-medium"
        style={{ color: config.color, opacity: 0.8 }}
      >
        ET
      </span>
      
      {/* Divider */}
      <div className="w-px h-4 bg-white/10" />
      
      {/* Session badge */}
      <span 
        className="text-xs font-semibold"
        style={{ color: config.color }}
      >
        {config.icon} {config.label}
      </span>
    </div>
  );
}
