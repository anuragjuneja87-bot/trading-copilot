import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Yodha Room',
  description: 'Your AI-powered trading command center. Real-time options flow, dark pool, gamma levels, and AI-synthesized verdicts.',
  icons: {
    icon: '/tradeyodha-logo.svg',
  },
};

export default function AskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
