// Shared market status utilities

export type MarketStatus = 'pre-market' | 'open' | 'after-hours' | 'closed';

// US Market Holidays 2024-2026
const MARKET_HOLIDAYS = [
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27',
  '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
];

function isMarketHoliday(date: Date): boolean {
  const dateStr = date.toISOString().split('T')[0];
  return MARKET_HOLIDAYS.includes(dateStr);
}

export function getMarketStatus(): MarketStatus {
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

export function getLastTradingDay(): Date {
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

export function formatTradingDay(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
}

export function isMarketClosed(): boolean {
  return getMarketStatus() === 'closed';
}
