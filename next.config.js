/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development
  reactStrictMode: true,

  // ── SECURITY: Disable source maps in production ──
  // Prevents exposing your source code to anyone who opens DevTools
  productionBrowserSourceMaps: false,
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.polygon.io',
      },
      {
        protocol: 'https',
        hostname: '**.benzinga.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  
  // Environment variables exposed to browser
  env: {
    NEXT_PUBLIC_APP_NAME: 'TradingCopilot',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
  
  // Headers for WebSocket/SSE support
  async headers() {
    return [
      {
        source: '/api/stream/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-transform' },
          { key: 'Connection', value: 'keep-alive' },
          { key: 'Content-Type', value: 'text/event-stream' },
        ],
      },
    ];
  },
  
  // Rewrites for API proxy (if needed for CORS)
  async rewrites() {
    return [
      // Proxy to your Databricks backend (configure in production)
      // {
      //   source: '/api/supervisor/:path*',
      //   destination: 'https://your-databricks-host/serving-endpoints/:path*',
      // },
    ];
  },
};

module.exports = nextConfig;
