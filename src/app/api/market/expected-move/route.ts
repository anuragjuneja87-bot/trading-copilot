import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();
  
  if (!ticker) {
    return NextResponse.json({ success: false, error: 'Ticker required' }, { status: 400 });
  }

  try {
    // Get current price
    const priceUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apiKey=${POLYGON_API_KEY}`;
    const priceRes = await fetch(priceUrl, { signal: AbortSignal.timeout(5000) });
    const priceData = await priceRes.json();
    const currentPrice = priceData.results?.[0]?.c || 0;
    
    if (!currentPrice) {
      return NextResponse.json({ success: false, error: 'Could not get price' }, { status: 500 });
    }

    // Get nearest weekly expiry
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    const expiryStr = friday.toISOString().split('T')[0];
    
    // Fetch ATM options for straddle price
    const atmStrike = Math.round(currentPrice);
    const optionsUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?strike_price=${atmStrike}&expiration_date=${expiryStr}&limit=10&apiKey=${POLYGON_API_KEY}`;
    
    const optionsRes = await fetch(optionsUrl, { signal: AbortSignal.timeout(10000) });
    
    let expectedMove = currentPrice * 0.015; // Default 1.5%
    let source = 'ESTIMATE';
    
    if (optionsRes.ok) {
      const optionsData = await optionsRes.json();
      const options = optionsData.results || [];
      
      const atmCall = options.find((o: any) => o.details?.contract_type === 'call');
      const atmPut = options.find((o: any) => o.details?.contract_type === 'put');
      
      if (atmCall && atmPut) {
        const callPrice = atmCall.last_quote?.midpoint || atmCall.day?.close || 0;
        const putPrice = atmPut.last_quote?.midpoint || atmPut.day?.close || 0;
        
        if (callPrice > 0 && putPrice > 0) {
          expectedMove = (callPrice + putPrice) * 0.85;
          source = 'STRADDLE';
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ticker,
        currentPrice: Math.round(currentPrice * 100) / 100,
        expectedMove: Math.round(expectedMove * 100) / 100,
        expectedMovePercent: Math.round((expectedMove / currentPrice) * 10000) / 100,
        upperBound: Math.round((currentPrice + expectedMove) * 100) / 100,
        lowerBound: Math.round((currentPrice - expectedMove) * 100) / 100,
        expiry: expiryStr,
        daysToExpiry: daysUntilFriday,
        source,
      },
    });
    
  } catch (error: any) {
    console.error('[Expected Move API] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
