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

// Oxanium font via Google Fonts
const oxanium = {
  className: 'font-oxanium',
  style: {
    fontFamily: "'Oxanium', 'JetBrains Mono', monospace",
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: 'TradingCopilot - AI Trading Intelligence',
    template: '%s | TradingCopilot',
  },
  description:
    'The AI trading copilot that tells you WHAT TO DO, not just what happened. Real-time options flow, crisis detection, and actionable verdicts.',
  keywords: [
    'options trading',
    'AI trading',
    'options flow',
    'dark pool',
    'trading signals',
    'market intelligence',
    'trading copilot',
  ],
  authors: [{ name: 'TradingCopilot' }],
  creator: 'TradingCopilot',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://tradingcopilot.io',
    siteName: 'TradingCopilot',
    title: 'TradingCopilot - AI Trading Intelligence',
    description:
      'Stop staring at options flow. Start getting answers. The AI trading copilot that tells you WHAT TO DO.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'TradingCopilot Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TradingCopilot - AI Trading Intelligence',
    description: 'The AI trading copilot that tells you WHAT TO DO, not just what happened.',
    images: ['/og-image.png'],
    creator: '@tradingcopilot',
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
  themeColor: '#06090f',
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
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
