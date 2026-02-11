import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free AI Trading Chat',
  description: 'Ask our AI trading copilot anything about the markets. Get actionable insights, not just data.',
};

export default function AskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
