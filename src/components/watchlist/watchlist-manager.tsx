'use client';

import { useState } from 'react';
import { useWatchlistStore } from '@/stores';
import { COLORS } from '@/lib/echarts-theme';
import { X, Plus, GripVertical, RotateCcw, Search } from 'lucide-react';

interface WatchlistManagerProps {
  compact?: boolean;
}

export function WatchlistManager({ compact = false }: WatchlistManagerProps) {
  const { watchlist, addSymbol, removeSymbol, resetToDefault } = useWatchlistStore();
  const [inputValue, setInputValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAdd = () => {
    if (inputValue.trim()) {
      addSymbol(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {watchlist.slice(0, 6).map((ticker) => (
          <button
            key={ticker}
            onClick={() => removeSymbol(ticker)}
            className="group flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-all"
            style={{
              background: 'rgba(0,229,255,0.1)',
              border: '1px solid rgba(0,229,255,0.2)',
              color: COLORS.cyan,
            }}
          >
            {ticker}
            <X className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
        {watchlist.length > 6 && (
          <span className="text-xs text-gray-500">+{watchlist.length - 6} more</span>
        )}
      </div>
    );
  }

  return (
    <div 
      className="rounded-xl p-4"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 
          className="text-sm font-bold text-white"
          style={{ fontFamily: "'Oxanium', monospace" }}
        >
          Watchlist ({watchlist.length}/20)
        </h3>
        <button
          onClick={resetToDefault}
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      {/* Add Input */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Add ticker..."
            className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all"
          style={{
            background: 'rgba(0,229,255,0.15)',
            border: '1px solid rgba(0,229,255,0.3)',
            color: COLORS.cyan,
          }}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Ticker List */}
      <div className="flex flex-wrap gap-2">
        {watchlist.map((ticker) => (
          <div
            key={ticker}
            className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer hover:bg-red-500/10"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <GripVertical className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100" />
            <span className="text-white">{ticker}</span>
            <button
              onClick={() => removeSymbol(ticker)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3 text-gray-400 hover:text-red-400" />
            </button>
          </div>
        ))}
      </div>

      {watchlist.length === 0 && (
        <p className="text-center text-gray-500 text-xs py-4">
          No tickers in watchlist. Add some above!
        </p>
      )}
    </div>
  );
}

// Inline ticker selector for pages
export function WatchlistSelector() {
  const { watchlist, addSymbol, removeSymbol } = useWatchlistStore();
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      addSymbol(inputValue.trim());
      setInputValue('');
      setShowInput(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {watchlist.map((ticker) => (
        <button
          key={ticker}
          onClick={() => removeSymbol(ticker)}
          className="group px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: 'rgba(0,229,255,0.15)',
            border: '1px solid rgba(0,229,255,0.3)',
            color: COLORS.cyan,
          }}
        >
          {ticker}
          <X className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-100" />
        </button>
      ))}
      
      {showInput ? (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          onBlur={() => !inputValue && setShowInput(false)}
          autoFocus
          placeholder="TICKER"
          className="w-20 px-2 py-1.5 rounded-lg text-xs bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
        />
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="px-2 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#888',
          }}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
