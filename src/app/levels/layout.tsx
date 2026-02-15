import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gamma Levels & GEX Chart | Options Gamma Exposure by Strike',
  description: 'Free real-time gamma exposure (GEX) chart with call wall, put wall, and max gamma levels. See where market makers are hedging and where price is likely to pin, stall, or reverse.',
  openGraph: {
    title: 'Gamma Levels & GEX Chart | TradingCopilot',
    description: 'Real-time gamma exposure by strike with key levels: call wall, put wall, max gamma pin.',
  },
};

export default function LevelsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
