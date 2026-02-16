import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ═══════════════════════════════════════════════════════════════
//  CLASSNAME UTILITIES
// ═══════════════════════════════════════════════════════════════

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ═══════════════════════════════════════════════════════════════
//  NUMBER FORMATTING
// ═══════════════════════════════════════════════════════════════

export function formatPrice(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatVolume(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

// ═══════════════════════════════════════════════════════════════
//  DATE/TIME FORMATTING
// ═══════════════════════════════════════════════════════════════

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  }).format(date);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  }).format(date);
}

export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(date);
}

// ═══════════════════════════════════════════════════════════════
//  MARKET SESSION UTILITIES
// ═══════════════════════════════════════════════════════════════

export type MarketSession = 'pre-market' | 'market-open' | 'after-hours' | 'closed';

export function getMarketSession(): MarketSession {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const hour = et.getHours();
  const minute = et.getMinutes();
  const time = hour * 100 + minute;

  // Weekend
  if (day === 0 || day === 6) return 'closed';

  // Pre-market: 4:00 AM - 9:30 AM ET
  if (time >= 400 && time < 930) return 'pre-market';

  // Regular hours: 9:30 AM - 4:00 PM ET
  if (time >= 930 && time < 1600) return 'market-open';

  // After hours: 4:00 PM - 8:00 PM ET
  if (time >= 1600 && time < 2000) return 'after-hours';

  return 'closed';
}

export function getSessionLabel(session: MarketSession): string {
  const labels: Record<MarketSession, string> = {
    'pre-market': 'PRE-MARKET',
    'market-open': 'MARKET OPEN',
    'after-hours': 'AFTER-HOURS',
    'closed': 'MARKET CLOSED',
  };
  return labels[session];
}

export function getSessionColor(session: MarketSession): string {
  const colors: Record<MarketSession, string> = {
    'pre-market': 'text-warning',
    'market-open': 'text-bull',
    'after-hours': 'text-warning',
    'closed': 'text-text-muted',
  };
  return colors[session];
}

// ═══════════════════════════════════════════════════════════════
//  TRADING UTILITIES
// ═══════════════════════════════════════════════════════════════

export function getChangeColor(change: number): string {
  if (change > 0.05) return 'text-bull';
  if (change < -0.05) return 'text-bear';
  return 'text-text-secondary';
}

export function getRegimeColor(status: 'normal' | 'elevated' | 'crisis'): string {
  const colors = {
    normal: 'text-bull bg-bull-bg',
    elevated: 'text-warning bg-warning-bg',
    crisis: 'text-bear bg-bear-bg',
  };
  return colors[status];
}

export function getRegimeDotColor(status: 'normal' | 'elevated' | 'crisis'): string {
  const colors = {
    normal: 'bg-bull',
    elevated: 'bg-warning',
    crisis: 'bg-bear',
  };
  return colors[status];
}

// ═══════════════════════════════════════════════════════════════
//  VALIDATION
// ═══════════════════════════════════════════════════════════════

export function isValidTicker(ticker: string): boolean {
  return /^[A-Z]{1,5}$/.test(ticker.toUpperCase());
}

export function sanitizeTicker(ticker: string): string {
  return ticker.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════
//  MISC
// ═══════════════════════════════════════════════════════════════

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ═══════════════════════════════════════════════════════════════
//  HTML UTILITIES
// ═══════════════════════════════════════════════════════════════

export { decodeHTMLEntities } from './utils/decode-html';
