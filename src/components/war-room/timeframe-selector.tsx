'use client';

import { cn } from '@/lib/utils';

export type Timeframe = '15m' | '1h' | '4h' | '1d' | '1w';

export const DEFAULT_TIMEFRAME: Timeframe = '15m';

interface TimeframeSelectorProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  className?: string;
}

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '15m', label: '15M' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

export function TimeframeSelector({ value, onChange, className }: TimeframeSelectorProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs text-gray-500 font-medium">⏱️ Timeframe</span>
      <div className="flex items-center bg-black/40 rounded-lg p-1 border border-white/10">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.value}
            onClick={() => onChange(tf.value)}
            className={cn(
              // Larger padding and font
              "px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200",
              // Better touch target (min 44px for mobile)
              "min-w-[44px] min-h-[44px]",
              value === tf.value 
                ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30" 
                : "text-gray-400 hover:text-white hover:bg-white/10"
            )}
          >
            {tf.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Helper: Convert timeframe to milliseconds for API queries
export function getTimeframeMs(tf: Timeframe): number {
  switch (tf) {
    case '15m': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    case '1w': return 7 * 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}

// Helper: Get timestamp range for API calls
export function getTimeframeRange(tf: Timeframe): { 
  from: number; 
  to: number;
  label: string;
} {
  const now = Date.now();
  const ms = getTimeframeMs(tf);
  
  // For day/week, align to market hours
  if (tf === '1d') {
    const today = new Date();
    today.setHours(9, 30, 0, 0); // Market open 9:30 AM
    return {
      from: today.getTime(),
      to: now,
      label: 'Today',
    };
  }
  
  if (tf === '1w') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(9, 30, 0, 0);
    return {
      from: weekAgo.getTime(),
      to: now,
      label: 'This Week',
    };
  }
  
  // For hours/minutes, simple subtraction
  const labels: Record<string, string> = {
    '15m': 'Last 15 min',
    '1h': 'Last hour',
    '4h': 'Last 4 hours',
  };
  
  return {
    from: now - ms,
    to: now,
    label: labels[tf] || tf,
  };
}

// US Market Holidays 2024-2026 (add more as needed)
const MARKET_HOLIDAYS = [
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27',
  '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', // Feb 16 = President's Day
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
];

function isMarketHoliday(date: Date): boolean {
  const dateStr = date.toISOString().split('T')[0];
  return MARKET_HOLIDAYS.includes(dateStr);
}

function getLastTradingDay(): Date {
  const now = new Date();
  let checkDate = new Date(now);
  
  // Go back until we find a trading day (not weekend, not holiday)
  for (let i = 0; i < 10; i++) { // Max 10 days back
    const day = checkDate.getDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = isMarketHoliday(checkDate);
    
    // If today and market hours haven't started, go back one more day
    const hour = checkDate.getHours();
    const isBeforeOpen = checkDate.toDateString() === now.toDateString() && hour < 9;
    
    if (!isWeekend && !isHoliday && !isBeforeOpen) {
      return checkDate;
    }
    
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  return checkDate; // Fallback
}

export type MarketStatus = 'pre-market' | 'open' | 'after-hours' | 'closed';

export interface TimeframeRangeResult {
  from: number;
  to: number;
  label: string;
  marketStatus: MarketStatus;
  isMarketClosed: boolean; // keep for backwards compatibility
  tradingDay: string;
}

// Detect current market session status
function getMarketStatus(): MarketStatus {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Weekend = closed
  if (day === 0 || day === 6) return 'closed';
  
  // Check if it's a market holiday
  if (isMarketHoliday(et)) return 'closed';
  
  // Check time of day (ET)
  const timeInMinutes = hour * 60 + minute;
  
  if (timeInMinutes >= 240 && timeInMinutes < 570) {
    // 4:00 AM - 9:30 AM = Pre-market
    return 'pre-market';
  } else if (timeInMinutes >= 570 && timeInMinutes < 960) {
    // 9:30 AM - 4:00 PM = Market Open
    return 'open';
  } else if (timeInMinutes >= 960 && timeInMinutes < 1200) {
    // 4:00 PM - 8:00 PM = After-hours
    return 'after-hours';
  } else {
    // 8:00 PM - 4:00 AM = Closed
    return 'closed';
  }
}

// Helper: Check if market is closed and get last trading day
export function getAdjustedTimeframeRange(tf: Timeframe): TimeframeRangeResult {
  const now = new Date();
  const lastTradingDay = getLastTradingDay();
  const marketStatus = getMarketStatus();
  const isMarketClosed = marketStatus === 'closed';
  
  const tradingDayStr = lastTradingDay.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
  
  // Set market hours for the trading day
  const marketOpen = new Date(lastTradingDay);
  marketOpen.setHours(9, 30, 0, 0);
  
  const marketClose = new Date(lastTradingDay);
  marketClose.setHours(16, 0, 0, 0);
  
  // Use current time if market is open, otherwise use market close
  const isMarketOpen = marketStatus === 'open';
  const endTime = isMarketOpen ? now.getTime() : marketClose.getTime();
  
  let from: number;
  let label: string;
  
  switch (tf) {
    case '15m':
      from = endTime - 15 * 60 * 1000;
      label = isMarketOpen ? 'Last 15 min' : `Last 15 min (${tradingDayStr})`;
      break;
    case '1h':
      from = endTime - 60 * 60 * 1000;
      label = isMarketOpen ? 'Last hour' : `Last hour (${tradingDayStr})`;
      break;
    case '4h':
      from = endTime - 4 * 60 * 60 * 1000;
      label = isMarketOpen ? 'Last 4 hours' : `Last 4 hours (${tradingDayStr})`;
      break;
    case '1d':
      from = marketOpen.getTime();
      label = isMarketOpen ? 'Today' : tradingDayStr;
      break;
    case '1w':
      const weekAgo = new Date(lastTradingDay);
      weekAgo.setDate(weekAgo.getDate() - 7);
      from = weekAgo.getTime();
      label = 'Past Week';
      break;
    default:
      from = endTime - 15 * 60 * 1000;
      label = 'Last 15 min';
  }
  
  return {
    from,
    to: endTime,
    label,
    marketStatus,
    isMarketClosed,
    tradingDay: tradingDayStr,
  };
}
