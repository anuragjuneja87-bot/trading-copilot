'use client';

import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SymbolEntryProps {
  watchlist: string[];
  onSymbolSelect: (symbol: string) => void;
  regime?: { status: string; vix: number };
}

export function SymbolEntry({ watchlist, onSymbolSelect, regime }: SymbolEntryProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = input.trim().toUpperCase();
    if (symbol.length >= 1 && symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
      onSymbolSelect(symbol);
    }
  };

  const handleChipClick = (symbol: string) => {
    onSymbolSelect(symbol);
  };

  // Time-based greeting
  const getGreeting = () => {
    const now = new Date();
    const etHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
    if (etHour >= 4 && etHour < 12) return 'Good morning';
    if (etHour >= 12 && etHour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Greeting + Regime */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          {getGreeting()}, Trader
        </h1>
        <p className="text-sm text-[#8b99b0]">
          Enter a symbol to open the War Room
        </p>
        {regime && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  regime.status === 'CRISIS' ? '#ff5252'
                  : regime.status === 'ELEVATED' ? '#ffc107'
                  : '#00e676',
              }}
            />
            <span className="text-[10px] uppercase tracking-wider text-[#4a6070]"
              style={{ fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
              {regime.status} REGIME
            </span>
            <span className="text-[10px] text-[#4a6070]"
              style={{ fontFamily: "'Oxanium', monospace" }}>
              VIX {regime.vix?.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Symbol Input */}
      <form onSubmit={handleSubmit} className="w-full max-w-md mb-8">
        <div
          className={cn(
            'relative flex items-center rounded-xl transition-all duration-300',
            isFocused
              ? 'ring-2 ring-[#00e5ff] shadow-[0_0_30px_rgba(0,229,255,0.15)]'
              : 'ring-1 ring-[rgba(255,255,255,0.08)]'
          )}
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <Search className="absolute left-4 h-5 w-5 text-[#4a6070]" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="SPY, NVDA, AAPL..."
            maxLength={5}
            className="w-full pl-12 pr-4 py-4 bg-transparent text-white text-lg font-semibold placeholder:text-[#2a4a5a] focus:outline-none tracking-wider"
            style={{ fontFamily: "'Oxanium', monospace" }}
          />
          {input.length > 0 && (
            <button
              type="submit"
              className="absolute right-3 px-4 py-2 rounded-lg text-sm font-bold transition-all hover:brightness-110"
              style={{ background: '#00e5ff', color: '#0a0f1a' }}
            >
              Analyze
            </button>
          )}
        </div>
      </form>

      {/* Watchlist Quick-Select */}
      {watchlist.length > 0 && (
        <div className="text-center">
          <div className="text-[9px] uppercase tracking-wider mb-3"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            YOUR WATCHLIST
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {watchlist.slice(0, 8).map((ticker) => (
              <button
                key={ticker}
                onClick={() => handleChipClick(ticker)}
                className="group px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#e0e6f0',
                  fontFamily: "'Oxanium', monospace",
                }}
              >
                <span className="group-hover:text-[#00e5ff] transition-colors">{ticker}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Popular Symbols (if no watchlist) */}
      {watchlist.length === 0 && (
        <div className="text-center">
          <div className="text-[9px] uppercase tracking-wider mb-3"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            POPULAR SYMBOLS
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'AMZN'].map((ticker) => (
              <button
                key={ticker}
                onClick={() => handleChipClick(ticker)}
                className="group px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#e0e6f0',
                  fontFamily: "'Oxanium', monospace",
                }}
              >
                <span className="group-hover:text-[#00e5ff] transition-colors">{ticker}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
