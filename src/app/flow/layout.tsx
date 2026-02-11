import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Real-time Options Flow',
  description: 'Track unusual options activity, sweeps, and institutional flow in real-time.',
};

export default function FlowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
