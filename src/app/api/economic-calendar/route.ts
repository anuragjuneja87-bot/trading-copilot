import { NextRequest, NextResponse } from 'next/server';

interface EconomicEvent {
  time: string;
  name: string;
  forecast?: string;
  previous?: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface EarningsEvent {
  ticker: string;
  name: string;
  time: 'BMO' | 'AMC';
  estimatedEPS?: string;
}

// Hardcoded major economic events for V1
// In production, this would come from a real economic calendar API
const MAJOR_ECONOMIC_EVENTS: Record<string, EconomicEvent[]> = {
  // First Friday of month: Jobs Report
  // First Wednesday: ADP Employment
  // Second Tuesday: CPI
  // Third Wednesday: FOMC Meeting
  // Last Thursday: GDP
  // These are examples - in production, calculate based on actual dates
};

// Hardcoded earnings calendar (example - in production, fetch from Polygon or other source)
const EARNINGS_CALENDAR: Record<string, EarningsEvent[]> = {
  // Example structure - would be populated from real data
};

function getEconomicEventsForDate(date: string): EconomicEvent[] {
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 5 = Friday
  const dayOfMonth = dateObj.getDate();
  const month = dateObj.getMonth() + 1; // 1-12

  const events: EconomicEvent[] = [];

  // First Friday of month: Jobs Report (Non-Farm Payrolls)
  if (dayOfWeek === 5 && dayOfMonth <= 7) {
    events.push({
      time: '08:30',
      name: 'Non-Farm Payrolls',
      forecast: 'N/A',
      previous: 'N/A',
      impact: 'HIGH',
    });
    events.push({
      time: '08:30',
      name: 'Unemployment Rate',
      forecast: 'N/A',
      previous: 'N/A',
      impact: 'HIGH',
    });
  }

  // First Wednesday: ADP Employment
  if (dayOfWeek === 3 && dayOfMonth <= 7) {
    events.push({
      time: '08:15',
      name: 'ADP Employment Change',
      forecast: 'N/A',
      previous: 'N/A',
      impact: 'MEDIUM',
    });
  }

  // Second Tuesday: CPI
  if (dayOfWeek === 2 && dayOfMonth >= 8 && dayOfMonth <= 14) {
    events.push({
      time: '08:30',
      name: 'CPI (MoM)',
      forecast: 'N/A',
      previous: 'N/A',
      impact: 'HIGH',
    });
    events.push({
      time: '08:30',
      name: 'CPI (YoY)',
      forecast: 'N/A',
      previous: 'N/A',
      impact: 'HIGH',
    });
  }

  // Third Wednesday: FOMC Meeting (if applicable)
  if (dayOfWeek === 3 && dayOfMonth >= 15 && dayOfMonth <= 21) {
    // FOMC meetings are scheduled separately, this is just an example
    // In production, check actual FOMC calendar
  }

  // Last Thursday: GDP (quarterly)
  if (dayOfWeek === 4 && dayOfMonth >= 25) {
    // GDP is quarterly, check if it's the last month of quarter
    const quarter = Math.floor(month / 3);
    if (month % 3 === 0) {
      events.push({
        time: '08:30',
        name: 'GDP (QoQ)',
        forecast: 'N/A',
        previous: 'N/A',
        impact: 'HIGH',
      });
    }
  }

  // Daily: Michigan Consumer Sentiment (Fridays)
  if (dayOfWeek === 5) {
    events.push({
      time: '10:00',
      name: 'Michigan Consumer Sentiment',
      forecast: 'N/A',
      previous: 'N/A',
      impact: 'MEDIUM',
    });
  }

  // Sort by time
  events.sort((a, b) => {
    const [aHour, aMin] = a.time.split(':').map(Number);
    const [bHour, bMin] = b.time.split(':').map(Number);
    return aHour * 60 + aMin - (bHour * 60 + bMin);
  });

  return events;
}

function getEarningsForDate(date: string): EarningsEvent[] {
  // In production, fetch from Polygon earnings calendar or other source
  // For V1, return empty array or hardcoded examples
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();

  // Example: Some companies typically report on certain days
  // This is placeholder logic
  const earnings: EarningsEvent[] = [];

  // Example earnings (would be fetched from real API)
  if (dayOfWeek === 2 || dayOfWeek === 3) {
    // Tuesday/Wednesday are common earnings days
    // In production, fetch actual earnings calendar
  }

  return earnings;
}

function getMarketHoliday(date: string): string | null {
  const dateObj = new Date(date);
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();

  // Major US market holidays
  if (month === 1 && day === 1) return 'New Year\'s Day';
  if (month === 1 && day === 20) return 'Martin Luther King Jr. Day';
  if (month === 2 && day === 17) return 'Presidents Day'; // Third Monday
  if (month === 4 && day === 15) return 'Good Friday'; // Varies
  if (month === 5 && day === 27) return 'Memorial Day'; // Last Monday
  if (month === 7 && day === 4) return 'Independence Day';
  if (month === 9 && day === 2) return 'Labor Day'; // First Monday
  if (month === 11 && day === 28) return 'Thanksgiving'; // Fourth Thursday
  if (month === 12 && day === 25) return 'Christmas';

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    
    // Default to today in ET timezone
    const today = new Date();
    const etDate = new Date(today.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const date = dateParam || etDate.toISOString().split('T')[0];

    const economicEvents = getEconomicEventsForDate(date);
    const earnings = getEarningsForDate(date);
    const marketHoliday = getMarketHoliday(date);

    return NextResponse.json(
      {
        success: true,
        data: {
          date,
          economicEvents,
          earnings,
          marketHoliday,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
        },
      }
    );
  } catch (error: any) {
    console.error('[Economic Calendar API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch economic calendar',
      },
      { status: 500 }
    );
  }
}
