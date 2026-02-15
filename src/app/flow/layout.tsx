import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live Options Flow Scanner | Real-Time Sweeps & Unusual Activity',
  description: 'Track real-time options flow with smart money scoring, sweep detection, and institutional flow analysis. See what hedge funds are trading before the market reacts.',
  openGraph: {
    title: 'Live Options Flow Scanner | TradingCopilot',
    description: 'Real-time options flow with sweep detection, smart money scoring, and AI-powered analysis.',
  },
};

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return children;
}
