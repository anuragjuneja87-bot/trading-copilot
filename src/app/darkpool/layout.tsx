import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dark Pool Activity Scanner | Institutional Block Trades & Hidden Liquidity',
  description: 'Track dark pool block trades in real-time. See where hedge funds are accumulating or distributing shares with bullish/bearish classification and significance scoring.',
  openGraph: {
    title: 'Dark Pool Activity Scanner | TradingCopilot',
    description: 'Real-time dark pool block trades with institutional flow classification and accumulation zone detection.',
  },
};

export default function DarkPoolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
