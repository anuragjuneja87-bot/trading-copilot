'use client';

import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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

interface CalendarTemplateProps {
  data: {
    date: string;
    economicEvents: EconomicEvent[];
    earnings: EarningsEvent[];
    marketHoliday?: string | null;
  };
  onFollowUp?: (query: string) => void;
}

function getImpactColor(impact: 'HIGH' | 'MEDIUM' | 'LOW'): string {
  switch (impact) {
    case 'HIGH':
      return '#ff5252';
    case 'MEDIUM':
      return '#ffc107';
    case 'LOW':
      return '#00e676';
    default:
      return '#8b99b0';
  }
}

export function CalendarTemplate({ data, onFollowUp }: CalendarTemplateProps) {
  const { date, economicEvents, earnings, marketHoliday } = data;
  const formattedDate = format(new Date(date), 'EEEE, MMMM d, yyyy');

  const handleFollowUp = (query: string) => {
    if (onFollowUp) {
      onFollowUp(query);
    }
  };

  const firstEarningsTicker = earnings.length > 0 ? earnings[0].ticker : null;

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">ECONOMIC CALENDAR</h2>
          <p className="text-xs text-[#8b99b0]">{formattedDate}</p>
        </div>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
          style={{ background: 'rgba(0,230,118,0.15)', color: '#00e676' }}
        >
          ⚡ &lt;1s
        </span>
      </div>

      {/* Holiday Banner */}
      {marketHoliday && (
        <div className="mb-6 p-3 rounded-lg bg-[rgba(255,193,7,0.1)] border border-[rgba(255,193,7,0.2)]">
          <p className="text-sm font-semibold text-[#ffc107]">Market Holiday: {marketHoliday}</p>
        </div>
      )}

      {/* Economic Events Timeline */}
      {economicEvents.length > 0 && (
        <div className="mb-8">
          <h3
            className="text-[9px] uppercase tracking-wider mb-4"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}
          >
            ECONOMIC EVENTS
          </h3>
          <div className="space-y-4">
            {economicEvents.map((event, idx) => (
              <div key={idx} className="flex items-start gap-4">
                <div className="w-16 text-right">
                  <span className="text-sm font-mono text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
                    {event.time}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getImpactColor(event.impact) }}
                    />
                    <span className="font-semibold text-white">{event.name}</span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${getImpactColor(event.impact)}20`,
                        color: getImpactColor(event.impact),
                      }}
                    >
                      {event.impact}
                    </span>
                  </div>
                  {(event.forecast || event.previous) && (
                    <div className="text-xs text-[#8b99b0] ml-4">
                      {event.forecast && <span>Est: {event.forecast}</span>}
                      {event.forecast && event.previous && <span className="mx-2">|</span>}
                      {event.previous && <span>Prev: {event.previous}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Earnings Section */}
      {earnings.length > 0 && (
        <div className="mb-6">
          <h3
            className="text-[9px] uppercase tracking-wider mb-4"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}
          >
            EARNINGS
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {earnings.map((earning, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-white">{earning.ticker}</span>
                  <span
                    className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded-full',
                      earning.time === 'BMO'
                        ? 'bg-[rgba(0,229,255,0.15)] text-[#00e5ff]'
                        : 'bg-[rgba(255,193,7,0.15)] text-[#ffc107]'
                    )}
                  >
                    {earning.time}
                  </span>
                </div>
                <p className="text-xs text-[#8b99b0] mb-1">{earning.name}</p>
                {earning.estimatedEPS && (
                  <p className="text-xs font-mono text-[#8b99b0]" style={{ fontFamily: "'Oxanium', monospace" }}>
                    Est. EPS: {earning.estimatedEPS}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {economicEvents.length === 0 && earnings.length === 0 && !marketHoliday && (
        <div className="text-center py-8 text-[#8b99b0]">
          <p className="text-sm">No economic events or earnings scheduled for today.</p>
        </div>
      )}

      {/* Follow-up pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {economicEvents.some(e => e.name.includes('CPI')) && (
          <button
            onClick={() => handleFollowUp('How does CPI typically affect SPY?')}
            className="px-3 py-1.5 rounded-full text-xs bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[#8b99b0] hover:text-white transition-colors"
          >
            How does CPI typically affect SPY?
          </button>
        )}
        {firstEarningsTicker && (
          <button
            onClick={() => handleFollowUp(`Thesis for ${firstEarningsTicker}`)}
            className="px-3 py-1.5 rounded-full text-xs bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[#8b99b0] hover:text-white transition-colors"
          >
            Thesis for {firstEarningsTicker}
          </button>
        )}
        {economicEvents.length > 0 && (
          <button
            onClick={() => handleFollowUp('Market impact of today\'s economic events')}
            className="px-3 py-1.5 rounded-full text-xs bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[#8b99b0] hover:text-white transition-colors"
          >
            Market impact of today's events
          </button>
        )}
      </div>

      {/* New Analysis button */}
      <button
        onClick={() => handleFollowUp('__NEW_ANALYSIS__')}
        className="text-xs text-[#8b99b0] hover:text-white transition-colors"
      >
        ← New Analysis
      </button>
    </div>
  );
}
