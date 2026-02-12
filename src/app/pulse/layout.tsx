import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market Pulse — Live Options Intelligence | TradingCopilot',
  description: 'Free real-time market data, options flow, and trading intelligence. Track SPY, QQQ, VIX, unusual options activity, and market sentiment — no signup required.',
  keywords: 'market pulse, options flow, VIX, SPY, QQQ, market sentiment, fear greed index, unusual options activity, free market data',
  openGraph: {
    title: 'Market Pulse — Live Options Intelligence | TradingCopilot',
    description: 'Free real-time market data, options flow, and trading intelligence.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Market Pulse — Live Options Intelligence',
    description: 'Free real-time market data, options flow, and trading intelligence.',
  },
};

export default function PulseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
