'use client';

import { useQuery } from '@tanstack/react-query';
import { Navbar, Footer } from '@/components/layout';
import { MarketOverviewBar } from '@/components/pulse/market-overview-bar';
import { FearGreedGauge } from '@/components/pulse/fear-greed-gauge';
import { UnusualOptionsActivity } from '@/components/pulse/unusual-options-activity';
import { KeyLevelsTeaser } from '@/components/pulse/key-levels-teaser';
import { NewsSentiment } from '@/components/pulse/news-sentiment';
import { AIInsightBanner } from '@/components/ai/ai-insight-banner';
import { useAIInsight } from '@/hooks/use-ai-insight';
import { Button } from '@/components/ui/button';
import { MessageSquare, ArrowRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function PulsePage() {
  // Fetch news data for AI insight
  const { data: newsData, isLoading: newsLoading, refetch: refetchNews } = useQuery({
    queryKey: ['news-sentiment', 'pulse'],
    queryFn: async () => {
      const res = await fetch('/api/news?limit=10');
      const data = await res.json();
      if (!data.success) throw new Error('Failed to fetch news');
      return data.data;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // AI Insight for news
  const aiInsight = useAIInsight({
    endpoint: '/api/ai/news-insight',
    payload: {
      marketMood: newsData?.marketMood || {},
      tickerSentiments: newsData?.tickerSentiments || [],
      articles: newsData?.articles?.slice(0, 10) || [],
    },
    enabled: !!newsData?.marketMood,
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Market Overview Bar */}
      <MarketOverviewBar />

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
        {/* AI Insight Banner */}
        {newsData?.marketMood && (
          <AIInsightBanner
            insight={aiInsight.insight}
            isLoading={aiInsight.isLoading}
            error={aiInsight.error}
            processingTime={aiInsight.processingTime}
            onRefresh={aiInsight.refresh}
            regime={newsData.marketMood.overall}
            title="MARKET SENTIMENT"
          />
        )}

        {/* Fear & Greed Gauge */}
        <FearGreedGauge />

        {/* Today's Unusual Options Activity */}
        <UnusualOptionsActivity />

        {/* Key Levels Teaser */}
        <KeyLevelsTeaser />

        {/* News Sentiment */}
        <NewsSentiment />

        {/* Bottom CTA Block */}
        <section className="py-16 lg:py-24">
          <div className="rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/10 via-transparent to-accent/10 p-12 text-center lg:p-16">
            <h2 className="text-3xl font-bold text-text-primary sm:text-4xl lg:text-5xl mb-4">
              Ready to stop guessing?
            </h2>
            <p className="text-lg text-text-secondary mb-8 max-w-2xl mx-auto">
              Join 500+ traders using AI to make better decisions
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="xl" asChild className="text-lg px-8 py-6">
                <Link href="/ask">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Start Free — 3 AI Questions Daily
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild className="text-lg px-8 py-6">
                <Link href="/pricing">
                  See Pricing
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
