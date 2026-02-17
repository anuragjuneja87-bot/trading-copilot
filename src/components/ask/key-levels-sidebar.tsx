'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface KeyLevelsData {
  callWall: number;
  putWall: number;
  maxGamma: number;
  gexFlip: number;
  maxPain: number;
  vwap: number;
  expectedMove: number;
  currentPrice: number;
  pivot?: number;
  r1?: number;
  s1?: number;
}

interface KeyLevelsSidebarProps {
  ticker: string;
  className?: string;
}

export function KeyLevelsSidebar({ ticker, className }: KeyLevelsSidebarProps) {
  const [levels, setLevels] = useState<KeyLevelsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLevels = async () => {
      if (!ticker) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // USE API ONLY - single source of truth
        const res = await fetch(`/api/market/levels/${ticker}`);
        const json = await res.json();
        
        if (json.success && json.data) {
          setLevels({
            callWall: json.data.callWall,
            putWall: json.data.putWall,
            maxGamma: json.data.maxGamma,
            gexFlip: json.data.gexFlip,
            maxPain: json.data.maxPain,
            vwap: json.data.vwap || json.data.currentPrice,
            expectedMove: json.data.expectedMove,
            currentPrice: json.data.currentPrice,
            pivot: json.data.pivot,
            r1: json.data.r1,
            s1: json.data.s1,
          });
        } else {
          setError('Failed to load levels');
        }
      } catch (err) {
        console.error('[KeyLevels] Fetch error:', err);
        setError('Failed to load levels');
      } finally {
        setLoading(false);
      }
    };

    fetchLevels();
    
    // Refresh every 30 seconds during market hours
    const interval = setInterval(fetchLevels, 30000);
    return () => clearInterval(interval);
  }, [ticker]);

  if (loading) {
    return (
      <div className={cn("p-4", className)}>
        <div className="animate-pulse space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 bg-white/5 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !levels) {
    return (
      <div className={cn("p-4 text-gray-500 text-sm", className)}>
        Unable to load key levels
      </div>
    );
  }

  // Calculate distance from current price
  const getDistance = (level: number) => {
    if (!levels.currentPrice || !level) return null;
    return ((level - levels.currentPrice) / levels.currentPrice * 100).toFixed(1);
  };

  // Define level config with colors
  const levelItems = [
    { 
      key: 'Call Wall', 
      value: levels.callWall, 
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      description: 'Resistance',
    },
    { 
      key: 'Put Wall', 
      value: levels.putWall, 
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      description: 'Support',
    },
    { 
      key: 'GEX Flip', 
      value: levels.gexFlip, 
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      description: 'Gamma neutral',
    },
    { 
      key: 'Max Pain', 
      value: levels.maxPain, 
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      description: 'Pin target',
    },
    { 
      key: 'VWAP', 
      value: levels.vwap, 
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      description: 'Fair value',
    },
  ];

  // Check for pin zone (Call Wall within 2% of Put Wall)
  const isPinZone = levels.callWall && levels.putWall && 
    Math.abs(levels.callWall - levels.putWall) / levels.currentPrice < 0.02;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-xs font-bold text-gray-400 uppercase mb-3 px-2">
        Key Levels
      </div>
      
      {/* Pin Zone Alert */}
      {isPinZone && (
        <div className="mx-2 mb-3 px-2 py-1.5 rounded bg-purple-500/20 border border-purple-500/30">
          <span className="text-xs text-purple-400 font-medium">
            📍 Pin Zone Active
          </span>
        </div>
      )}
      
      {/* Level Items */}
      {levelItems.map((item) => {
        const distance = getDistance(item.value);
        const isAbove = item.value > levels.currentPrice;
        
        return (
          <div 
            key={item.key} 
            className={cn(
              "flex justify-between items-center py-2 px-2 rounded mx-1",
              item.bgColor
            )}
          >
            <div className="flex flex-col">
              <span className="text-xs text-gray-400">{item.key}</span>
            </div>
            <div className="text-right">
              <span className={cn("font-bold text-sm", item.color)}>
                ${item.value?.toFixed(0) || '—'}
              </span>
              {distance && (
                <span className={cn(
                  "text-[10px] ml-1",
                  isAbove ? 'text-green-500' : 'text-red-500'
                )}>
                  ({isAbove ? '+' : ''}{distance}%)
                </span>
              )}
            </div>
          </div>
        );
      })}
      
      {/* Expected Move */}
      {levels.expectedMove && (
        <div className="mx-2 mt-3 pt-3 border-t border-white/10">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Expected Move</span>
            <span className="text-sm font-bold text-cyan-400">
              ±${levels.expectedMove.toFixed(2)}
            </span>
          </div>
          <div className="text-[10px] text-gray-600 mt-1">
            Range: ${(levels.currentPrice - levels.expectedMove).toFixed(2)} - ${(levels.currentPrice + levels.expectedMove).toFixed(2)}
          </div>
        </div>
      )}
      
      {/* GEX Flip Position Indicator */}
      {levels.gexFlip && levels.currentPrice && (
        <div className="mx-2 mt-3 pt-3 border-t border-white/10">
          <div className={cn(
            "text-[10px] px-2 py-1 rounded text-center",
            levels.currentPrice > levels.gexFlip 
              ? "bg-green-500/10 text-green-400"
              : "bg-red-500/10 text-red-400"
          )}>
            {levels.currentPrice > levels.gexFlip 
              ? "↑ Above GEX Flip — Mean Reversion Zone"
              : "↓ Below GEX Flip — Trend Acceleration Zone"
            }
          </div>
        </div>
      )}
    </div>
  );
}
