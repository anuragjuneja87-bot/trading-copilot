'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { decodeHTMLEntities } from '@/lib/utils';
import {
  PANEL_COLORS as C, FONT_MONO, panelStyles as S,
} from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   NEWS SENTIMENT PANEL v3.1
   
   v3.1 fix:
   - ★ Sentiment detection now uses `sentimentLabel` field 
     ('BULLISH'|'BEARISH'|'NEUTRAL') which is ALWAYS set by the API.
   - Was checking `sentimentValue` (optional, rarely set) and 
     `sentiment` (a NUMBER like 0.3 — String(0.3) never matches
     'positive'/'bullish'). Result: everything showed as Neutral.
   ════════════════════════════════════════════════════════════════ */

interface NewsSentimentPanelProps {
  ticker: string;
  items: any[];
  loading: boolean;
}

/* ★ Robust sentiment extraction — checks ALL possible field names */
function extractSentiment(item: any): 'bullish' | 'bearish' | 'neutral' {
  // 1. sentimentLabel — set by our API, always available
  const label = item?.sentimentLabel;
  if (typeof label === 'string') {
    const l = label.toUpperCase();
    if (l === 'BULLISH' || l === 'POSITIVE') return 'bullish';
    if (l === 'BEARISH' || l === 'NEGATIVE') return 'bearish';
    if (l === 'NEUTRAL') return 'neutral';
  }

  // 2. sentimentValue — legacy optional field ('positive'|'negative'|'neutral')
  const sv = item?.sentimentValue;
  if (typeof sv === 'string') {
    const s = sv.toLowerCase();
    if (s === 'positive' || s.includes('bull')) return 'bullish';
    if (s === 'negative' || s.includes('bear')) return 'bearish';
    return 'neutral';
  }

  // 3. sentiment — numeric score (-1 to +1)
  const score = item?.sentiment;
  if (typeof score === 'number') {
    if (score > 0.15) return 'bullish';
    if (score < -0.15) return 'bearish';
    return 'neutral';
  }

  return 'neutral';
}

export function NewsSentimentPanel({ ticker, items: news, loading }: NewsSentimentPanelProps) {
  const sentimentSummary = useMemo(() => {
    if (!news?.length) return null;
    let positive = 0, negative = 0, neutral = 0;
    news.forEach(item => {
      const s = extractSentiment(item);
      if (s === 'bullish') positive++;
      else if (s === 'bearish') negative++;
      else neutral++;
    });
    const total = positive + negative + neutral;
    const score = total > 0 ? ((positive - negative) / total) : 0;
    const overall = positive > negative ? 'BULLISH' : negative > positive ? 'BEARISH' : 'MIXED';
    const color = overall === 'BULLISH' ? C.green : overall === 'BEARISH' ? C.red : C.yellow;
    const bg = overall === 'BULLISH' ? C.greenDim : overall === 'BEARISH' ? C.redDim : C.yellowDim;
    return { score, label: overall, color, bg, positive, negative, neutral, total };
  }, [news]);

  const getSentimentInfo = (item: any) => {
    const s = extractSentiment(item);
    if (s === 'bullish') return { color: C.green, label: 'Bullish' };
    if (s === 'bearish') return { color: C.red, label: 'Bearish' };
    return { color: C.yellow, label: 'Neutral' };
  };

  const formatAge = (item: any) => {
    const ts = item.publishedUtc || item.publishedAt || item.timestamp || item.published_utc;
    if (!ts) return '';
    const ago = Date.now() - new Date(ts).getTime();
    if (ago < 60000) return 'now';
    if (ago < 3600000) return `${Math.floor(ago / 60000)}m ago`;
    if (ago < 86400000) return `${Math.floor(ago / 3600000)}h ago`;
    return `${Math.floor(ago / 86400000)}d ago`;
  };

  // Detect sentiment shift
  const sentimentShift = useMemo(() => {
    if (!news?.length || news.length < 4) return null;
    const sorted = [...news].sort((a, b) => {
      const tsA = new Date(a.publishedUtc || a.publishedAt || a.timestamp || a.published_utc || 0).getTime();
      const tsB = new Date(b.publishedUtc || b.publishedAt || b.timestamp || b.published_utc || 0).getTime();
      return tsB - tsA;
    });

    const mid = Math.floor(sorted.length / 2);
    const recentItems = sorted.slice(0, mid);
    const olderItems = sorted.slice(mid);

    const countBias = (items: any[]) => {
      let p = 0, n = 0;
      items.forEach(item => {
        const s = extractSentiment(item);
        if (s === 'bullish') p++;
        else if (s === 'bearish') n++;
      });
      return p > n ? 'bullish' : n > p ? 'bearish' : 'mixed';
    };

    const recentBias = countBias(recentItems);
    const olderBias = countBias(olderItems);

    if (recentBias !== olderBias && recentBias !== 'mixed') {
      return { direction: recentBias, color: recentBias === 'bullish' ? C.green : C.red };
    }
    return null;
  }, [news]);

  const scoreBarPct = sentimentSummary ? Math.round(((sentimentSummary.score + 1) / 2) * 100) : 50;

  if (loading && !news.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading news...</div></div>;
  if (!news.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>📰</span><span style={{ fontSize: 14, fontWeight: 600 }}>No Headlines</span></div></div>;

  const ss = sentimentSummary!;

  return (
    <div style={S.panel}>
      <div style={S.metricsStrip}>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Sentiment</span>
          <span style={S.metricValue(ss.color, 15)}>{ss.label}</span>
          <div style={S.badge(ss.color, ss.bg)}>{ss.positive} Bull / {ss.negative} Bear</div>
        </div>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Score</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={S.metricValue(ss.color, 15)}>{ss.score >= 0 ? '+' : ''}{ss.score.toFixed(2)}</span>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden', minWidth: 60 }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${C.red}, ${C.yellow} 50%, ${C.green})`, opacity: 0.5 }} />
              <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${scoreBarPct}%`, width: 3, borderRadius: 1, background: ss.color, boxShadow: `0 0 4px ${ss.color}60`, transform: 'translateX(-50%)' }} />
            </div>
          </div>
          <span style={S.metricSub}>-1.0 (bear) to +1.0 (bull)</span>
        </div>
        <div style={S.metricBlock(true)}>
          <span style={S.metricLabel}>Headlines</span>
          <span style={S.metricValue(C.textPrimary, 15)}>{news.length}</span>
          <span style={S.metricSub}>Last: {news.length > 0 ? formatAge(news[0]) : '—'}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {news.slice(0, 10).map((item, i) => {
          const si = getSentimentInfo(item);
          const title = decodeHTMLEntities(item.title || item.headline || '');
          const source = item.publisher?.name || item.source?.name || item.source || '';
          const age = formatAge(item);

          return (
            <div key={i} style={{ padding: '8px 14px', borderBottom: `1px solid ${C.borderSubtle}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ paddingTop: 4, flexShrink: 0 }}>
                <div style={S.dot(si.color)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.textPrimary, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                  {title}
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, fontFamily: FONT_MONO }}>
                  {source}{source && age ? ' · ' : ''}{age}
                  {si.label && <> · <span style={{ color: si.color }}>{si.label}</span></>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={S.bottomStrip}>
        <div style={S.dot(sentimentShift ? sentimentShift.color : ss.color)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}>
          {sentimentShift ? (
            <>
              <strong style={{ color: C.textPrimary, fontWeight: 600 }}>Sentiment shift:</strong>{' '}
              Turned {sentimentShift.direction} in recent headlines
            </>
          ) : (
            <>
              <strong style={{ color: C.textPrimary, fontWeight: 600 }}>Sentiment:</strong>{' '}
              {ss.label === 'BULLISH' ? 'Positive headline bias this session' : ss.label === 'BEARISH' ? 'Negative headline lean' : 'Mixed sentiment across headlines'}
            </>
          )}
        </span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>
          {news.length} articles · {ticker}
        </span>
      </div>
    </div>
  );
}
