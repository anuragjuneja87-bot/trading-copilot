/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development
  reactStrictMode: true,
  
  // Image optimization domains (add your CDN/image hosts)
  images: {
    domains: ['cdn.sanity.io', 'images.unsplash.com'],
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
