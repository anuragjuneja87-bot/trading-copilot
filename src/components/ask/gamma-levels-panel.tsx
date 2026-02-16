'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';

interface GammaLevelsPanelProps {
  ticker: string;
}

interface LevelsData {
  price: number;
  change: number;
  changePercent: number;
  r1: number;
  r2: number;
  r3: number;
  pivot: number;
  s1: number;
  s2: number;
  s3: number;
}

export function GammaLevelsPanel({ ticker }: GammaLevelsPanelProps) {
  const [levels, setLevels] = useState<LevelsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLevels = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/market/levels/${ticker}`);
        const data = await res.json();
        if (data.success && data.data) {
          setLevels(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch levels:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLevels();

    const handleRefresh = () => fetchLevels();
    window.addEventListener('refresh-ask-data', handleRefresh);
    return () => window.removeEventListener('refresh-ask-data', handleRefresh);
  }, [ticker]);

  if (loading) {
    return (
      <div 
        className="rounded-xl p-4 flex items-center justify-center"
        style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
      >
        <span className="text-gray-500 text-xs">Loading levels...</span>
      </div>
    );
  }

  if (!levels || !levels.price) {
    return (
      <div 
        className="rounded-xl p-4 flex items-center justify-center"
        style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
      >
        <span className="text-gray-500 text-xs">No levels data</span>
      </div>
    );
  }

  // Calculate range for positioning
  const allLevels = [levels.r3, levels.r2, levels.r1, levels.pivot, levels.s1, levels.s2, levels.s3].filter(Boolean);
  const minLevel = Math.min(...allLevels, levels.price);
  const maxLevel = Math.max(...allLevels, levels.price);
  const range = maxLevel - minLevel;

  const getPosition = (value: number) => {
    if (range === 0) return 50;
    return ((value - minLevel) / range) * 100;
  };

  const pricePosition = getPosition(levels.price);
  const isPositive = levels.changePercent >= 0;

  return (
    <div 
      className="rounded-xl p-4 flex flex-col overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex-shrink-0">
        Gamma Exposure / Key Levels
      </h3>

      {/* Price Display */}
      <div className="text-center mb-3 flex-shrink-0">
        <span className="text-2xl font-bold text-white font-mono">
          ${levels.price.toFixed(2)}
        </span>
        <span 
          className="ml-2 text-sm font-semibold"
          style={{ color: isPositive ? COLORS.green : COLORS.red }}
        >
          {isPositive ? '+' : ''}{levels.changePercent.toFixed(2)}%
        </span>
      </div>

      {/* Levels Visualization */}
      <div className="flex-1 flex flex-col justify-center space-y-1.5">
        <LevelRow 
          label="R3" 
          value={levels.r3} 
          price={levels.price}
          position={getPosition(levels.r3)}
          pricePosition={pricePosition}
          type="resistance" 
        />
        <LevelRow 
          label="R2" 
          value={levels.r2} 
          price={levels.price}
          position={getPosition(levels.r2)}
          pricePosition={pricePosition}
          type="resistance" 
        />
        <LevelRow 
          label="R1" 
          value={levels.r1} 
          price={levels.price}
          position={getPosition(levels.r1)}
          pricePosition={pricePosition}
          type="resistance" 
        />
        <LevelRow 
          label="Pivot" 
          value={levels.pivot} 
          price={levels.price}
          position={getPosition(levels.pivot)}
          pricePosition={pricePosition}
          type="pivot" 
        />
        <LevelRow 
          label="S1" 
          value={levels.s1} 
          price={levels.price}
          position={getPosition(levels.s1)}
          pricePosition={pricePosition}
          type="support" 
        />
        <LevelRow 
          label="S2" 
          value={levels.s2} 
          price={levels.price}
          position={getPosition(levels.s2)}
          pricePosition={pricePosition}
          type="support" 
        />
        <LevelRow 
          label="S3" 
          value={levels.s3} 
          price={levels.price}
          position={getPosition(levels.s3)}
          pricePosition={pricePosition}
          type="support" 
        />
      </div>
    </div>
  );
}

function LevelRow({ 
  label, 
  value, 
  price,
  position,
  pricePosition,
  type 
}: { 
  label: string; 
  value: number; 
  price: number;
  position: number;
  pricePosition: number;
  type: 'resistance' | 'support' | 'pivot';
}) {
  if (!value || isNaN(value)) return null;
  
  const color = type === 'resistance' ? COLORS.red : type === 'support' ? COLORS.green : COLORS.cyan;
  const isCurrentZone = Math.abs(value - price) / price < 0.003; // Within 0.3%

  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-[10px] text-gray-500 font-medium">{label}</span>
      
      {/* Visual Bar */}
      <div className="flex-1 h-2 rounded-full bg-white/5 relative overflow-hidden">
        {/* Level marker */}
        <div 
          className="absolute top-0 h-full rounded-full transition-all"
          style={{ 
            left: 0,
            width: `${position}%`,
            background: `linear-gradient(90deg, transparent 0%, ${color}40 100%)`,
          }}
        />
        
        {/* Current price indicator line */}
        <div 
          className="absolute top-0 w-0.5 h-full"
          style={{ 
            left: `${pricePosition}%`,
            background: COLORS.cyan,
            boxShadow: `0 0 4px ${COLORS.cyan}`,
          }}
        />
        
        {/* Level dot */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
          style={{ 
            left: `${position}%`,
            transform: `translate(-50%, -50%)`,
            background: color,
            boxShadow: isCurrentZone ? `0 0 8px ${color}` : 'none',
          }}
        />
      </div>
      
      <span 
        className="w-16 text-right text-xs font-mono font-semibold"
        style={{ color }}
      >
        ${value.toFixed(2)}
      </span>
    </div>
  );
}
