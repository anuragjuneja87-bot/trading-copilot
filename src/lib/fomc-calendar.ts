/**
 * FOMC Calendar, OpEx Dates & Market Event Flags
 *
 * Provides deterministic features:
 * - days_to_next_fomc
 * - is_fomc_day / is_fomc_week
 * - is_opex_week
 * - day_of_week
 * - time_of_day_bucket
 */

// FOMC meeting dates (announcement day, typically Wednesday)
// Source: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
const FOMC_DATES_2025_2026 = [
  // 2025
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
  '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-17',
  // 2026
  '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-16',
].map(d => new Date(d + 'T00:00:00'));

/**
 * Get the 3rd Friday of a month (monthly options expiration)
 */
function getThirdFriday(year: number, month: number): Date {
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay();
  // Days until first Friday
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  const firstFriday = 1 + daysUntilFriday;
  const thirdFriday = firstFriday + 14;
  return new Date(year, month, thirdFriday);
}

/**
 * Get the start of the week (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.setDate(diff));
}

/**
 * Check if two dates are in the same week (Mon-Fri)
 */
function isSameWeek(a: Date, b: Date): boolean {
  const weekA = getWeekStart(a).toDateString();
  const weekB = getWeekStart(b).toDateString();
  return weekA === weekB;
}

/**
 * Check if two dates are the same calendar day
 */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export interface CalendarFeatures {
  days_to_next_fomc: number;
  is_fomc_day: number;
  is_fomc_week: number;
  is_opex_week: number;
  day_of_week: number; // 0=Mon, 4=Fri
  time_of_day_bucket: number; // 0=open, 1=morning, 2=midday, 3=afternoon, 4=close
}

/**
 * Compute all calendar-based features for a given timestamp.
 * Uses ET (Eastern Time) for market session detection.
 */
export function getCalendarFeatures(now?: Date): CalendarFeatures {
  const date = now || new Date();

  // Convert to ET
  const etStr = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);

  // Days to next FOMC
  const today = new Date(et.getFullYear(), et.getMonth(), et.getDate());
  let daysToFomc = 365; // fallback
  for (const fomcDate of FOMC_DATES_2025_2026) {
    const diff = Math.ceil(
      (fomcDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff >= 0 && diff < daysToFomc) {
      daysToFomc = diff;
    }
  }

  // Is FOMC day
  const isFomcDay = FOMC_DATES_2025_2026.some(d => isSameDay(d, today)) ? 1 : 0;

  // Is FOMC week
  const isFomcWeek = FOMC_DATES_2025_2026.some(d => isSameWeek(d, today)) ? 1 : 0;

  // Is OpEx week (week containing 3rd Friday)
  const thirdFriday = getThirdFriday(et.getFullYear(), et.getMonth());
  const isOpexWeek = isSameWeek(thirdFriday, today) ? 1 : 0;

  // Day of week (0=Monday ... 4=Friday, matching training data)
  const jsDay = et.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // Convert to 0=Mon

  // Time of day bucket (matching training data session mapping)
  const hour = et.getHours();
  const minute = et.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  let timeOfDayBucket: number;
  if (timeInMinutes < 600) {
    // Before 10:00 AM = open session (first 30 min)
    timeOfDayBucket = 0; // open
  } else if (timeInMinutes < 720) {
    // 10:00 - 12:00 = morning
    timeOfDayBucket = 1; // morning
  } else if (timeInMinutes < 840) {
    // 12:00 - 2:00 PM = midday
    timeOfDayBucket = 2; // midday
  } else if (timeInMinutes < 930) {
    // 2:00 - 3:30 PM = afternoon
    timeOfDayBucket = 3; // afternoon
  } else {
    // 3:30 - 4:00 PM = close
    timeOfDayBucket = 4; // close
  }

  return {
    days_to_next_fomc: daysToFomc,
    is_fomc_day: isFomcDay,
    is_fomc_week: isFomcWeek,
    is_opex_week: isOpexWeek,
    day_of_week: Math.min(dayOfWeek, 4), // Cap at 4 for weekends
    time_of_day_bucket: timeOfDayBucket,
  };
}
