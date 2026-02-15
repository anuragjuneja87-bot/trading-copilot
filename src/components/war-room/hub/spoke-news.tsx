'use client';

interface SpokeNewsProps {
  articles: Array<any>; // Flexible to handle NewsItem or other shapes
  sentiment?: { score: number; label: string };
}

export function SpokeNews({ articles, sentiment }: SpokeNewsProps) {
  const getSeverityColor = (severity?: string) => {
    if (severity === 'CRISIS') return '#ff5252';
    if (severity === 'ELEVATED') return '#ffc107';
    return '#00e676';
  };

  const formatTime = (publishedAt?: string | Date) => {
    if (!publishedAt) return '';
    const date = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[9px] uppercase tracking-wider"
          style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
          NEWS &amp; SENTIMENT
        </div>
        {sentiment && (
          <span
            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
            style={{
              background: sentiment.label === 'BULLISH' ? 'rgba(0,230,118,0.1)'
                : sentiment.label === 'BEARISH' ? 'rgba(255,82,82,0.1)'
                : 'rgba(255,193,7,0.1)',
              color: sentiment.label === 'BULLISH' ? '#00e676'
                : sentiment.label === 'BEARISH' ? '#ff5252'
                : '#ffc107',
            }}
          >
            {sentiment.label}
          </span>
        )}
      </div>

      {/* Articles list */}
      {articles.length === 0 ? (
        <div className="text-center py-8 text-[11px] text-[#4a6070]">
          No recent news available
        </div>
      ) : (
        <div className="space-y-0 max-h-[280px] overflow-y-auto">
          {articles.slice(0, 6).map((article: any, i: number) => {
            // Map NewsArticle/NewsItem fields to expected shape
            // NewsArticle has: title, description, articleUrl, publishedUtc, publisher.name, severity, sentimentLabel
            // NewsItem has: headline, summary, source, publishedAt, url, severity
            const title = article.title || article.headline || '';
            const source = article.publisher?.name || article.source || article.publisher || article.author || '';
            const publishedAt = article.publishedUtc || article.publishedAt || article.published_utc || article.timestamp || article.published;
            const severity = article.severity || (article.impactScore >= 4 ? 'CRISIS' : article.impactScore >= 3 ? 'ELEVATED' : 'NORMAL');
            const url = article.articleUrl || article.url || article.article_url || '#';
            const teaser = article.description || article.teaser || article.summary || '';

            return (
              <div
                key={i}
                onClick={() => url && url !== '#' && window.open(url, '_blank')}
                className="group px-3 py-2 cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.02)]"
                style={{
                  borderLeft: `2px solid ${getSeverityColor(severity)}`,
                  borderBottom: i < articles.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                }}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: getSeverityColor(severity) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-white leading-snug line-clamp-2 group-hover:text-[#00e5ff] transition-colors">
                      {title}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[9px] text-[#4a6070]">
                      {source && <span>{source}</span>}
                      {publishedAt && (
                        <>
                          {source && <span>•</span>}
                          <span>{formatTime(publishedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
