'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';

interface KeyLevelsData {
  callWall: number | null;
  putWall: number | null;
  maxGamma: number | null;
  price: number | null;
}

interface KeyLevelsSidebarProps {
  ticker: string;
}

export function KeyLevelsSidebar({ ticker }: KeyLevelsSidebarProps) {
  const [levels, setLevels] = useState<KeyLevelsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLevels = async () => {
      if (!ticker) return;
      
      setLoading(true);
      try {
        // Get current price first
        const priceRes = await fetch(`/api/market/prices?tickers=${ticker}`);
        const priceData = await priceRes.json();
        const price = priceData.data?.[0]?.price || priceData.data?.prices?.[0]?.price || null;

        // Get options flow data to calculate levels
        const flowRes = await fetch(`/api/flow/options?tickers=${ticker}&limit=200`);
        const flowData = await flowRes.json();
        
        if (flowData.success) {
          const trades = flowData.data?.trades || flowData.data || [];
          
          if (trades.length > 0) {
            // Calculate Call Wall (strike with most call premium)
            const callsByStrike = new Map<number, number>();
            const putsByStrike = new Map<number, number>();
            
            trades.forEach((trade: any) => {
              const strike = trade.strike;
              if (!strike) return;
              
              const premium = trade.premium || 0;
              
              if (trade.contract_type === 'call') {
                callsByStrike.set(strike, (callsByStrike.get(strike) || 0) + premium);
              } else {
                putsByStrike.set(strike, (putsByStrike.get(strike) || 0) + premium);
              }
            });

            // Find max call strike (Call Wall)
            let callWall: number | null = null;
            let maxCallPremium = 0;
            callsByStrike.forEach((premium, strike) => {
              if (premium > maxCallPremium) {
                maxCallPremium = premium;
                callWall = strike;
              }
            });

            // Find max put strike (Put Wall)
            let putWall: number | null = null;
            let maxPutPremium = 0;
            putsByStrike.forEach((premium, strike) => {
              if (premium > maxPutPremium) {
                maxPutPremium = premium;
                putWall = strike;
              }
            });

            // Max Gamma is typically where dealer hedging flips
            // Estimate as weighted average of high-activity strikes near the money
            let maxGamma: number | null = null;
            if (price) {
              // Find strikes within 5% of current price with highest combined activity
              const nearMoneyStrikes: { strike: number; activity: number }[] = [];
              
              const allStrikes = new Set([...callsByStrike.keys(), ...putsByStrike.keys()]);
              allStrikes.forEach(strike => {
                const pctFromPrice = Math.abs(strike - price) / price;
                if (pctFromPrice < 0.05) { // Within 5%
                  const callActivity = callsByStrike.get(strike) || 0;
                  const putActivity = putsByStrike.get(strike) || 0;
                  nearMoneyStrikes.push({ strike, activity: callActivity + putActivity });
                }
              });
              
              if (nearMoneyStrikes.length > 0) {
                // Max gamma at highest activity near-money strike
                nearMoneyStrikes.sort((a, b) => b.activity - a.activity);
                maxGamma = nearMoneyStrikes[0].strike;
              }
            }

            // Fallback: if no max gamma found, use midpoint between walls
            if (!maxGamma && callWall && putWall) {
              maxGamma = Math.round((callWall + putWall) / 2);
            }

            setLevels({ callWall, putWall, maxGamma, price });
          } else {
            // No trades, try to estimate from price levels
            if (price) {
              const roundedPrice = Math.round(price);
              setLevels({
                callWall: roundedPrice + 10,
                putWall: roundedPrice - 10,
                maxGamma: roundedPrice,
                price,
              });
            } else {
              setLevels(null);
            }
          }
        }
      } catch (err) {
        console.error('[KeyLevels] Failed to fetch:', err);
        setLevels(null);
      } finally {
        setLoading(false);
      }
    };

    fetchLevels();
    
    // Listen for refresh
    const handleRefresh = () => fetchLevels();
    window.addEventListener('refresh-ask-data', handleRefresh);
    return () => window.removeEventListener('refresh-ask-data', handleRefresh);
  }, [ticker]);

  const formatPrice = (val: number | null) => {
    if (val === null) return '$—';
    return `$${val.toFixed(0)}`;
  };

  return (
    <div>
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
        {ticker} Key Levels
      </h3>
      
      {loading ? (
        <div className="space-y-1.5">
          <LevelRow label="Call Wall" value="..." color="#666" />
          <LevelRow label="Put Wall" value="..." color="#666" />
          <LevelRow label="Max Gamma" value="..." color="#666" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <LevelRow 
            label="Call Wall" 
            value={formatPrice(levels?.callWall ?? null)} 
            color={COLORS.green}
          />
          <LevelRow 
            label="Put Wall" 
            value={formatPrice(levels?.putWall ?? null)} 
            color={COLORS.red}
          />
          <LevelRow 
            label="Max Gamma" 
            value={formatPrice(levels?.maxGamma ?? null)} 
            color={COLORS.cyan}
          />
        </div>
      )}
    </div>
  );
}

function LevelRow({ label, value, color }: { 
  label: string; 
  value: string; 
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span 
        className="text-xs font-mono font-semibold"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}
