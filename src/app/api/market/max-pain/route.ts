import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();
  
  if (!ticker) {
    return NextResponse.json({ success: false, error: 'Ticker required' }, { status: 400 });
  }

  try {
    // Get nearest Friday
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    const expiryStr = friday.toISOString().split('T')[0];
    
    // Fetch options chain
    const optionsUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expiryStr}&limit=250&apiKey=${POLYGON_API_KEY}`;
    const optionsRes = await fetch(optionsUrl, { signal: AbortSignal.timeout(15000) });
    
    if (!optionsRes.ok) {
      return NextResponse.json({ success: false, error: 'Failed to fetch options' }, { status: 500 });
    }
    
    const optionsData = await optionsRes.json();
    const options = optionsData.results || [];
    
    if (options.length === 0) {
      return NextResponse.json({ success: false, error: 'No options data' }, { status: 404 });
    }

    // Get unique strikes
    const strikes = [...new Set(options.map((o: any) => o.details?.strike_price).filter(Boolean))].sort((a, b) => a - b);
    
    // Calculate max pain
    let maxPainStrike = 0;
    let minPain = Infinity;
    
    for (const testPrice of strikes) {
      let totalPain = 0;
      
      options.forEach((opt: any) => {
        const strike = opt.details?.strike_price;
        const oi = opt.open_interest || 0;
        const isCall = opt.details?.contract_type === 'call';
        
        if (isCall && testPrice > strike) {
          totalPain += (testPrice - strike) * oi * 100;
        } else if (!isCall && testPrice < strike) {
          totalPain += (strike - testPrice) * oi * 100;
        }
      });
      
      if (totalPain < minPain) {
        minPain = totalPain;
        maxPainStrike = testPrice;
      }
    }

    // Get current price
    const priceUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apiKey=${POLYGON_API_KEY}`;
    const priceRes = await fetch(priceUrl, { signal: AbortSignal.timeout(5000) });
    const priceData = await priceRes.json();
    const currentPrice = priceData.results?.[0]?.c || 0;
    
    const distance = maxPainStrike - currentPrice;
    const distancePercent = currentPrice > 0 ? (distance / currentPrice) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        ticker,
        maxPain: maxPainStrike,
        currentPrice: Math.round(currentPrice * 100) / 100,
        distance: Math.round(distance * 100) / 100,
        distancePercent: Math.round(distancePercent * 100) / 100,
        expiry: expiryStr,
        daysToExpiry: daysUntilFriday,
        strikeCount: strikes.length,
      },
    });
    
  } catch (error: any) {
    console.error('[Max Pain API] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
