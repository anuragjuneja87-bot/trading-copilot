/**
 * Simple WebSocket test - No external dependencies required
 * Uses Node.js built-in modules only
 * 
 * Usage: 
 *   node test-websocket-simple.js YOUR_API_KEY
 *   OR
 *   NEXT_PUBLIC_MASSIVE_API_KEY=your_key node test-websocket-simple.js
 */

const https = require('https');
const http = require('http');

// Get API key from args or env
const API_KEY = process.argv[2] || process.env.NEXT_PUBLIC_MASSIVE_API_KEY;
const WS_URL = process.env.NEXT_PUBLIC_MASSIVE_WS_URL || 'wss://socket.massive.com';
const MODE = process.argv[3] || 'AM'; // 'A' or 'AM'

if (!API_KEY || API_KEY.includes('your_')) {
  console.error('❌ Error: API key required');
  console.log('');
  console.log('Usage:');
  console.log('  node test-websocket-simple.js YOUR_API_KEY');
  console.log('  OR');
  console.log('  NEXT_PUBLIC_MASSIVE_API_KEY=your_key node test-websocket-simple.js');
  console.log('');
  console.log('Get your API key from Massive.com dashboard');
  process.exit(1);
}

console.log('==========================================');
console.log('Testing Massive.com WebSocket (Simple)');
console.log('==========================================');
console.log('');
console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
console.log(`WebSocket URL: ${WS_URL}/options/${MODE}`);
console.log('');
console.log('⚠️  Note: This script requires Node.js with WebSocket support');
console.log('   For full WebSocket testing, install: npm install ws');
console.log('   Then use: node test-websocket.js');
console.log('');
console.log('Testing REST API endpoint instead...');
console.log('');

// Test REST API instead (works without WebSocket)
const testRestAPI = () => {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/flow/options?tickers=SPY&minPremium=0&limit=5',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log('✅ REST API Response:');
        console.log(JSON.stringify(json, null, 2));
        
        if (json.success && json.data?.flow) {
          console.log('');
          console.log(`📊 Found ${json.data.flow.length} flow items`);
          if (json.data.flow.length > 0) {
            console.log('');
            console.log('Sample item:');
            console.log(JSON.stringify(json.data.flow[0], null, 2));
          }
        }
      } catch (error) {
        console.log('Raw response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('Make sure your Next.js dev server is running:');
    console.log('  npm run dev');
  });

  req.end();
};

// Check if WebSocket is available
try {
  // Try to require ws (if installed)
  const WebSocket = require('ws');
  
  console.log('✅ WebSocket library found! Testing WebSocket connection...');
  console.log('');
  
  const wsUrl = `${WS_URL}/options/${MODE}?apiKey=${API_KEY}`;
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('✅ WebSocket connected!');
    console.log('');
    
    const testContract = 'O:SPY240119C00450000';
    console.log(`📡 Subscribing to: ${testContract}`);
    
    const subscribeMsg = {
      action: 'subscribe',
      ticker: testContract,
    };
    
    ws.send(JSON.stringify(subscribeMsg));
    
    setTimeout(() => {
      console.log('📡 Subscribing to all SPY contracts...');
      ws.send(JSON.stringify({ action: 'subscribe', ticker: 'O:SPY*' }));
    }, 2000);
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received:', JSON.stringify(message, null, 2));
    } catch (error) {
      console.log('📨 Raw:', data.toString());
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket closed');
  });

  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('');
      console.log('⏱️  No data in 30s. Connection may be working but no trades occurred.');
    }
    ws.close();
  }, 30000);

} catch (error) {
  // WebSocket not available, test REST API instead
  console.log('⚠️  WebSocket library not found, testing REST API instead...');
  console.log('');
  testRestAPI();
}
