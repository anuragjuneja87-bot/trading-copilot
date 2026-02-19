import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Get last trading day's date string
function getLastTradingDate(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  const timeInMinutes = hour * 60 + minute;
  
  let checkDate = new Date(et);
  
  // If before market open or weekend, go back
  const isWeekend = day === 0 || day === 6;
  const isBeforeOpen = timeInMinutes < 570; // Before 9:30 AM
  
  if (isWeekend || isBeforeOpen) {
    if (isBeforeOpen && !isWeekend) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }
  
  // Format as YYYY-MM-DD from local components (NOT toISOString which converts to UTC)
  const yyyy = checkDate.getFullYear();
  const mm = String(checkDate.getMonth() + 1).padStart(2, '0');
  const dd = String(checkDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase();
    
    if (!ticker) {
      return NextResponse.json({ success: false, error: 'Ticker required' }, { status: 400 });
    }
    
    const dateStr = getLastTradingDate();
    const tickers = [ticker];
    if (ticker !== 'SPY') tickers.push('SPY');
    if (ticker !== 'QQQ') tickers.push('QQQ');
    
    // Fetch 5-minute bars for all tickers in parallel
    const fetchBars = async (sym: string) => {
      const url = `https://api.polygon.io/v2/aggs/ticker/${sym}/range/5/minute/${dateStr}/${dateStr}?adjusted=true&sort=asc&limit=500&apiKey=${POLYGON_API_KEY}`;
      const res = await fetch(url, { 
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).filter((bar: any) => {
        // Only regular hours (9:30 AM - 4:00 PM ET)
        const barDate = new Date(bar.t);
        const barET = new Date(barDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const minutes = barET.getHours() * 60 + barET.getMinutes();
        return minutes >= 570 && minutes < 960;
      });
    };
    
    const results = await Promise.all(tickers.map(fetchBars));
    
    // Build normalized % change series from open
    const buildSeries = (bars: any[]) => {
      if (!bars.length) return [];
      const openPrice = bars[0].o;
      return bars.map((bar: any) => {
        const date = new Date(bar.t);
        return {
          time: date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/New_York',
          }),
          timeMs: bar.t,
          price: bar.c,
          pctChange: ((bar.c - openPrice) / openPrice) * 100,
          volume: bar.v,
        };
      });
    };
    
    const series: Record<string, any[]> = {};
    tickers.forEach((sym, i) => {
      series[sym] = buildSeries(results[i]);
    });
    
    // Calculate relative strength metrics
    const tickerSeries = series[ticker] || [];
    const spySeries = series['SPY'] || [];
    const qqqSeries = series['QQQ'] || [];
    
    const latestTicker = tickerSeries[tickerSeries.length - 1];
    const latestSpy = spySeries[spySeries.length - 1];
    const latestQqq = qqqSeries[qqqSeries.length - 1];
    
    const tickerChange = latestTicker?.pctChange || 0;
    const spyChange = latestSpy?.pctChange || 0;
    const qqqChange = latestQqq?.pctChange || 0;
    
    const rsVsSpy = tickerChange - spyChange;
    const rsVsQqq = tickerChange - qqqChange;
    
    // Calculate correlation (Pearson's r) between ticker and SPY
    const calculateCorrelation = (a: number[], b: number[]) => {
      const n = Math.min(a.length, b.length);
      if (n < 5) return 0;
      
      const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
      const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
      
      let num = 0, denA = 0, denB = 0;
      for (let i = 0; i < n; i++) {
        const da = a[i] - meanA;
        const db = b[i] - meanB;
        num += da * db;
        denA += da * da;
        denB += db * db;
      }
      
      const den = Math.sqrt(denA * denB);
      return den === 0 ? 0 : num / den;
    };
    
    const tickerChanges = tickerSeries.map((d: any) => d.pctChange);
    const spyChanges = spySeries.map((d: any) => d.pctChange);
    const qqqChanges = qqqSeries.map((d: any) => d.pctChange);
    
    const corrSpy = calculateCorrelation(tickerChanges, spyChanges);
    const corrQqq = calculateCorrelation(tickerChanges, qqqChanges);
    
    // Determine RS regime
    let regime: 'STRONG_OUTPERFORM' | 'OUTPERFORM' | 'INLINE' | 'UNDERPERFORM' | 'STRONG_UNDERPERFORM';
    const avgRS = (rsVsSpy + rsVsQqq) / 2;
    
    if (avgRS > 1.5) regime = 'STRONG_OUTPERFORM';
    else if (avgRS > 0.5) regime = 'OUTPERFORM';
    else if (avgRS > -0.5) regime = 'INLINE';
    else if (avgRS > -1.5) regime = 'UNDERPERFORM';
    else regime = 'STRONG_UNDERPERFORM';
    
    // Build RS time series (ticker % - SPY %)
    const rsTimeSeries = tickerSeries.map((d: any, i: number) => {
      const spyPct = spySeries[i]?.pctChange || 0;
      const qqqPct = qqqSeries[i]?.pctChange || 0;
      return {
        time: d.time,
        timeMs: d.timeMs,
        tickerPct: d.pctChange,
        spyPct,
        qqqPct,
        rsVsSpy: d.pctChange - spyPct,
        rsVsQqq: d.pctChange - qqqPct,
      };
    });
    
    return NextResponse.json({
      success: true,
      data: {
        ticker,
        date: dateStr,
        series,
        rsTimeSeries,
        summary: {
          tickerChange,
          spyChange,
          qqqChange,
          rsVsSpy: Math.round(rsVsSpy * 100) / 100,
          rsVsQqq: Math.round(rsVsQqq * 100) / 100,
          corrSpy: Math.round(corrSpy * 100) / 100,
          corrQqq: Math.round(corrQqq * 100) / 100,
          regime,
        },
      },
    });
  } catch (error: any) {
    console.error('[Relative Strength API] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
