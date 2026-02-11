'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Newspaper,
  RefreshCw,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TickerSentiment, MarketMood } from '@/types/news';

export function MarketMoodBanner({ 
  marketMood, 
  tickerSentiments 
}: { 
  marketMood: MarketMood;
  tickerSentiments: TickerSentiment[];
}) {
  const { insight, isLoading, refreshInsight } = useNewsInsight(marketMood, tickerSentiments);

  const moodConfig = {
    RISK_ON: { 
      bg: 'bg-bull/10', 
      border: 'border-bull/30', 
      iconBg: 'bg-bull/20',
      iconColor: 'text-bull',
      badgeBg: 'bg-bull/20',
      badgeText: 'text-bull',
      label: '🟢 RISK ON' 
    },
    RISK_OFF: { 
      bg: 'bg-bear/10', 
      border: 'border-bear/30', 
      iconBg: 'bg-bear/20',
      iconColor: 'text-bear',
      badgeBg: 'bg-bear/20',
      badgeText: 'text-bear',
      label: '🔴 RISK OFF' 
    },
    NEUTRAL: { 
      bg: 'bg-background-card', 
      border: 'border-background-elevated', 
      iconBg: 'bg-accent/20',
      iconColor: 'text-accent',
      badgeBg: 'bg-background-elevated',
      badgeText: 'text-text-secondary',
      label: '⚪ NEUTRAL' 
    },
  };

  const mood = moodConfig[marketMood.overall];

  return (
    <div className={cn("rounded-xl p-4 border", mood.bg, mood.border)}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", mood.iconBg)}>
          <Brain className={cn("w-5 h-5", mood.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-text-muted">MARKET MOOD</span>
            {isLoading && (
              <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            )}
            <button
              onClick={refreshInsight}
              disabled={isLoading}
              className="ml-2 p-1 rounded hover:bg-background-elevated transition-colors disabled:opacity-50"
              title="Refresh AI insight"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-text-muted", isLoading && "animate-spin")} />
            </button>
          </div>
          <p className="text-text-primary leading-relaxed">{insight}</p>
        </div>
        <div className={cn("px-3 py-1.5 rounded-lg text-sm font-semibold flex-shrink-0", mood.badgeBg, mood.badgeText)}>
          {mood.label}
        </div>
      </div>
      
      {/* Quick Stats Row */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-background-elevated/50">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-text-muted" />
          <span className="text-sm text-text-muted">{marketMood.totalArticles} articles</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-bull" />
          <span className="text-sm text-bull">{marketMood.distribution.bullish} bullish</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-bear" />
          <span className="text-sm text-bear">{marketMood.distribution.bearish} bearish</span>
        </div>
        {marketMood.topBullish.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <Zap className="w-4 h-4 text-bull" />
            <span className="text-sm text-text-secondary">Hot:</span>
            {marketMood.topBullish.slice(0, 2).map(ticker => (
              <span key={ticker} className="text-sm font-medium text-bull">{ticker}</span>
            ))}
          </div>
        )}
        {marketMood.topBearish.length > 0 && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-4 h-4 text-bear" />
            <span className="text-sm text-text-secondary">Watch:</span>
            {marketMood.topBearish.slice(0, 2).map(ticker => (
              <span key={ticker} className="text-sm font-medium text-bear">{ticker}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TickerSentimentCards({ 
  tickerSentiments, 
  onTickerClick 
}: { 
  tickerSentiments: TickerSentiment[];
  onTickerClick?: (ticker: string) => void;
}) {
  // Filter to only show tickers with articles
  const activeSentiments = tickerSentiments.filter(t => t.articleCount > 0);

  if (activeSentiments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-muted">SENTIMENT BY TICKER</h3>
        <span className="text-xs text-text-muted">{activeSentiments.length} tickers with news</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {activeSentiments.map(sentiment => (
          <TickerSentimentCard 
            key={sentiment.ticker} 
            sentiment={sentiment}
            onClick={() => onTickerClick?.(sentiment.ticker)}
          />
        ))}
      </div>
    </div>
  );
}

function TickerSentimentCard({ 
  sentiment, 
  onClick 
}: { 
  sentiment: TickerSentiment;
  onClick?: () => void;
}) {
  const sentimentConfig = {
    BULLISH: { 
      bg: 'bg-bull/10 hover:bg-bull/20', 
      border: 'border-bull/30',
      icon: <TrendingUp className="w-4 h-4 text-bull" />,
      scoreColor: 'text-bull',
    },
    BEARISH: { 
      bg: 'bg-bear/10 hover:bg-bear/20', 
      border: 'border-bear/30',
      icon: <TrendingDown className="w-4 h-4 text-bear" />,
      scoreColor: 'text-bear',
    },
    NEUTRAL: { 
      bg: 'bg-background-card hover:bg-background-elevated', 
      border: 'border-background-elevated',
      icon: <Minus className="w-4 h-4 text-text-muted" />,
      scoreColor: 'text-text-secondary',
    },
  };

  const config = sentimentConfig[sentiment.sentimentLabel];
  const scoreDisplay = sentiment.sentimentScore > 0 
    ? `+${(sentiment.sentimentScore * 100).toFixed(0)}` 
    : (sentiment.sentimentScore * 100).toFixed(0);

  return (
    <button
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg border transition-colors text-left",
        config.bg,
        config.border
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-text-primary">{sentiment.ticker}</span>
        {config.icon}
      </div>
      <div className={cn("text-lg font-bold", config.scoreColor)}>
        {scoreDisplay}%
      </div>
      <div className="text-xs text-text-muted mt-1">
        {sentiment.articleCount} article{sentiment.articleCount !== 1 ? 's' : ''}
      </div>
      {sentiment.latestHeadline && (
        <div className="text-xs text-text-muted mt-2 line-clamp-2 leading-tight">
          {sentiment.latestHeadline}
        </div>
      )}
    </button>
  );
}

// AI Insight Hook - ONLY on load or manual refresh
function useNewsInsight(marketMood: MarketMood, tickerSentiments: TickerSentiment[]) {
  const [insight, setInsight] = useState<string>('Analyzing market sentiment...');
  const [isLoading, setIsLoading] = useState(false);
  const hasFetchedRef = useRef(false);

  const fetchInsight = async () => {
    if (!marketMood || marketMood.totalArticles === 0) {
      setInsight('Waiting for news data...');
      return;
    }
    
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/news-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            ...marketMood,
            tickerSentiments: tickerSentiments.slice(0, 10),
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setInsight(data.insight);
        console.log(`News insight generated in ${data.latencyMs}ms`);
      } else {
        throw new Error('API error');
      }
    } catch (error) {
      console.error('News insight error:', error);
      setInsight(generateRuleBasedInsight(marketMood));
    } finally {
      setIsLoading(false);
    }
  };

  // ONLY fetch on initial mount when we have data
  useEffect(() => {
    if (!hasFetchedRef.current && marketMood.totalArticles > 0) {
      hasFetchedRef.current = true;
      fetchInsight();
    }
  }, [marketMood.totalArticles]);

  const refreshInsight = () => {
    fetchInsight();
  };

  return { insight, isLoading, refreshInsight };
}

function generateRuleBasedInsight(mood: MarketMood): string {
  const bullishPct = mood.totalArticles > 0 
    ? Math.round((mood.distribution.bullish / mood.totalArticles) * 100) 
    : 0;
  const bearishPct = mood.totalArticles > 0 
    ? Math.round((mood.distribution.bearish / mood.totalArticles) * 100) 
    : 0;

  const topBullish = mood.topBullish.slice(0, 2).join(', ');
  const topBearish = mood.topBearish.slice(0, 2).join(', ');

  if (mood.overall === 'RISK_ON') {
    return `Bullish sentiment dominates with ${bullishPct}% positive coverage. ${topBullish ? `Leading strength: ${topBullish}.` : ''}`;
  } else if (mood.overall === 'RISK_OFF') {
    return `Bearish sentiment with ${bearishPct}% negative coverage. ${topBearish ? `Under pressure: ${topBearish}.` : ''}`;
  }
  
  return `Mixed sentiment (${bullishPct}% bullish / ${bearishPct}% bearish). No clear directional bias.`;
}
