/**
 * Test Massive.com WebSocket based on official documentation
 * Docs: https://massive.com/docs/websocket/options/aggregates-per-minute
 * 
 * Endpoint: WS /options/AM
 * Query Parameter: ticker (required)
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Load .env
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

const API_KEY = process.env.NEXT_PUBLIC_MASSIVE_API_KEY || 
                process.env.POLYGON_API_KEY || 
                process.argv[2];

if (!API_KEY || API_KEY.includes('your_')) {
  console.error('❌ Error: API key required');
  console.log('Set NEXT_PUBLIC_MASSIVE_API_KEY or POLYGON_API_KEY in .env');
  process.exit(1);
}

// Per docs: Endpoint is WS /options/AM
// Need to find base URL - try common Massive.com/Polygon.io formats
const baseUrls = [
  'wss://socket.polygon.io',      // Polygon.io (most likely)
  'wss://socket.massive.com',     // Massive.com direct
  'wss://ws.massive.com',          // Alternative
  'wss://api.massive.com',         // Alternative
  'wss://stream.massive.com',      // Alternative
];

const MODE = 'AM'; // Per-minute aggregates
const TEST_TICKER = 'O:SPY240119C00450000'; // Example option contract

console.log('==========================================');
console.log('Testing Massive.com WebSocket');
console.log('Based on: https://massive.com/docs/websocket/options/aggregates-per-minute');
console.log('==========================================');
console.log('');
console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
console.log(`Endpoint: WS /options/${MODE}`);
console.log(`Test Ticker: ${TEST_TICKER}`);
console.log('');

let currentUrlIndex = 0;

function testNextUrl() {
  if (currentUrlIndex >= baseUrls.length) {
    console.log('');
    console.log('==========================================');
    console.log('❌ All base URLs failed');
    console.log('==========================================');
    console.log('');
    console.log('The documentation shows endpoint: WS /options/AM');
    console.log('But the base WebSocket URL is not specified.');
    console.log('');
    console.log('Please check:');
    console.log('1. Your Massive.com dashboard for WebSocket connection URL');
    console.log('2. API documentation for base WebSocket URL');
    console.log('3. Contact Massive.com support for the exact URL');
    console.log('');
    console.log('Common formats to try:');
    console.log('  - wss://socket.polygon.io/options/AM?apiKey=KEY&ticker=TICKER');
    console.log('  - wss://socket.massive.com/options/AM?apiKey=KEY&ticker=TICKER');
    console.log('  - wss://your-custom-url.massive.com/options/AM?apiKey=KEY&ticker=TICKER');
    process.exit(1);
  }

  const baseUrl = baseUrls[currentUrlIndex];
  
  // Try different URL formats based on docs
  // Format 1: Ticker as query parameter (per docs: "Query Parameters: ticker")
  const url1 = `${baseUrl}/options/${MODE}?apiKey=${API_KEY}&ticker=${TEST_TICKER}`;
  
  // Format 2: API key in query, ticker in subscription
  const url2 = `${baseUrl}/options/${MODE}?apiKey=${API_KEY}`;
  
  // Format 3: No query params, auth and ticker in messages
  const url3 = `${baseUrl}/options/${MODE}`;

  console.log(`Testing ${currentUrlIndex + 1}/${baseUrls.length}: ${baseUrl}`);
  console.log(`  Format 1: ${url1.replace(API_KEY, '***').replace(TEST_TICKER, 'TICKER')}`);
  
  testUrl(url1, url2, url3, baseUrl);
}

function testUrl(url1, url2, url3, baseUrl) {
  // Try format 1 first (ticker in query param)
  const ws = new WebSocket(url1);

  const timeout = setTimeout(() => {
    if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    console.log('  ⏱️  Timeout - trying next format...');
    currentUrlIndex++;
    setTimeout(() => testNextUrl(), 1000);
  }, 10000);

  ws.on('open', () => {
    clearTimeout(timeout);
    console.log(`  ✅ Connected to: ${baseUrl}`);
    console.log('  📡 Waiting for data...');
    
    // If connected, we might need to send auth or subscription
    // Try sending auth first (Polygon.io style)
    setTimeout(() => {
      const authMsg = { action: 'auth', params: API_KEY };
      ws.send(JSON.stringify(authMsg));
      console.log('  🔐 Sent authentication');
    }, 500);
    
    // Keep connection alive to see if we get data
    setTimeout(() => {
      console.log('');
      console.log('==========================================');
      console.log(`✅ SUCCESS! Working URL: ${baseUrl}`);
      console.log('==========================================');
      console.log(`Use: ${baseUrl}/options/${MODE}?apiKey=YOUR_KEY&ticker=TICKER`);
      console.log('');
      ws.close();
      process.exit(0);
    }, 5000);
  });

  ws.on('message', (data) => {
    clearTimeout(timeout);
    try {
      const message = JSON.parse(data.toString());
      console.log('  📨 Received:', JSON.stringify(message, null, 2));
      
      if (message.ev === 'AM' || message.ev === 'A') {
        console.log('');
        console.log('==========================================');
        console.log(`✅ SUCCESS! Working URL: ${baseUrl}`);
        console.log('==========================================');
        console.log(`Base URL: ${baseUrl}`);
        console.log(`Full URL: ${baseUrl}/options/${MODE}?apiKey=YOUR_KEY&ticker=TICKER`);
        console.log('');
        ws.close();
        process.exit(0);
      } else if (message[0]?.ev === 'status') {
        console.log(`  Status: ${message[0].status}`);
      }
    } catch (error) {
      console.log('  📨 Raw:', data.toString().substring(0, 200));
    }
  });

  ws.on('error', (error) => {
    clearTimeout(timeout);
    if (error.message.includes('404')) {
      console.log('  ❌ 404 - URL not found');
    } else {
      console.log(`  ❌ Error: ${error.message}`);
    }
    currentUrlIndex++;
    setTimeout(() => testNextUrl(), 1000);
  });

  ws.on('close', (code, reason) => {
    clearTimeout(timeout);
    if (code === 1000) return; // Normal closure
    if (currentUrlIndex < baseUrls.length - 1) {
      currentUrlIndex++;
      setTimeout(() => testNextUrl(), 1000);
    }
  });
}

testNextUrl();
