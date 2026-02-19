import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono } from 'next/font/google';
import { Providers, ThemeProvider } from './providers';
import '@/styles/globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://tradeyodha.com'),
  title: {
    default: 'TradeYodha — AI Trading Intelligence',
    template: '%s | TradeYodha',
  },
  description:
    'Your AI trading warrior. Real-time options flow, dark pool detection, gamma levels, and AI-synthesized verdicts in one command center.',
  keywords: [
    'options trading',
    'AI trading',
    'options flow',
    'dark pool',
    'trading signals',
    'market intelligence',
    'tradeyodha',
    'gamma exposure',
    'relative strength',
  ],
  authors: [{ name: 'TradeYodha' }],
  creator: 'TradeYodha',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://tradeyodha.com',
    siteName: 'TradeYodha',
    title: 'TradeYodha — Your AI Trading Warrior',
    description:
      'See what Wall Street sees. Real-time options flow, dark pool prints, gamma levels, and AI-synthesized verdicts.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'TradeYodha — AI Trading Intelligence',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TradeYodha — AI Trading Intelligence',
    description: 'Your AI trading warrior. Real-time options flow, dark pool, gamma levels, and AI verdicts.',
    images: ['/og-image.png'],
    creator: '@tradeyodha',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#060810',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Oxanium:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
