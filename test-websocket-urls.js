/**
 * Test multiple WebSocket URL formats to find the correct one
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

const API_KEY = process.env.NEXT_PUBLIC_MASSIVE_API_KEY || process.env.POLYGON_API_KEY || process.argv[2];

if (!API_KEY || API_KEY.includes('your_')) {
  console.error('❌ Error: API key required');
  console.log('Set NEXT_PUBLIC_MASSIVE_API_KEY or POLYGON_API_KEY in .env');
  process.exit(1);
}

// Different URL formats to try
const urlFormats = [
  // Format 1: Polygon.io standard
  {
    name: 'Polygon.io (standard)',
    url: `wss://socket.polygon.io/options/AM?apiKey=${API_KEY}`,
    authAfterConnect: true,
  },
  // Format 2: Polygon.io without query param
  {
    name: 'Polygon.io (no query)',
    url: `wss://socket.polygon.io/options/AM`,
    authAfterConnect: true,
  },
  // Format 3: Massive.com (current attempt)
  {
    name: 'Massive.com (current)',
    url: `wss://socket.massive.com/options/AM?apiKey=${API_KEY}`,
    authAfterConnect: false,
  },
  // Format 4: Massive.com without query
  {
    name: 'Massive.com (no query)',
    url: `wss://socket.massive.com/options/AM`,
    authAfterConnect: false,
  },
  // Format 5: Polygon.io with different path
  {
    name: 'Polygon.io (different path)',
    url: `wss://socket.polygon.io/options?apiKey=${API_KEY}`,
    authAfterConnect: true,
  },
  // Format 6: Try without /options
  {
    name: 'Polygon.io (root)',
    url: `wss://socket.polygon.io?apiKey=${API_KEY}`,
    authAfterConnect: true,
  },
];

let currentTest = 0;

function testNextUrl() {
  if (currentTest >= urlFormats.length) {
    console.log('');
    console.log('==========================================');
    console.log('❌ All URL formats failed');
    console.log('==========================================');
    console.log('');
    console.log('Next steps:');
    console.log('1. Check your Massive.com/Polygon.io dashboard for WebSocket URL');
    console.log('2. Verify your API key has WebSocket access enabled');
    console.log('3. Check if your plan includes WebSocket features');
    console.log('4. Contact Massive.com support for the correct WebSocket endpoint');
    process.exit(1);
  }

  const format = urlFormats[currentTest];
  console.log('');
  console.log(`Testing ${currentTest + 1}/${urlFormats.length}: ${format.name}`);
  console.log(`URL: ${format.url.replace(API_KEY, '***')}`);
  console.log('');

  const ws = new WebSocket(format.url);

  const timeout = setTimeout(() => {
    if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
      ws.close();
      console.log('⏱️  Timeout (10s) - trying next format...');
      currentTest++;
      testNextUrl();
    }
  }, 10000);

  ws.on('open', () => {
    clearTimeout(timeout);
    console.log('✅ Connection opened!');
    
    if (format.authAfterConnect) {
      console.log('🔐 Sending authentication...');
      const authMsg = {
        action: 'auth',
        params: API_KEY,
      };
      ws.send(JSON.stringify(authMsg));
      
      // Wait for auth response
      setTimeout(() => {
        console.log('📡 Sending test subscription...');
        const subscribeMsg = {
          action: 'subscribe',
          params: 'AM.O:SPY240119C00450000',
        };
        ws.send(JSON.stringify(subscribeMsg));
        
        // Keep connection alive to see if we get data
        setTimeout(() => {
          console.log('');
          console.log('==========================================');
          console.log(`✅ SUCCESS! Working format: ${format.name}`);
          console.log('==========================================');
          console.log(`Use this URL: ${format.url.replace(API_KEY, 'YOUR_API_KEY')}`);
          console.log(`Auth after connect: ${format.authAfterConnect}`);
          console.log('');
          ws.close();
          process.exit(0);
        }, 3000);
      }, 1000);
    } else {
      // No auth needed, try subscribing directly
      console.log('📡 Sending test subscription...');
      const subscribeMsg = {
        action: 'subscribe',
        params: 'AM.O:SPY240119C00450000',
      };
      ws.send(JSON.stringify(subscribeMsg));
      
      setTimeout(() => {
        console.log('');
        console.log('==========================================');
        console.log(`✅ SUCCESS! Working format: ${format.name}`);
        console.log('==========================================');
        console.log(`Use this URL: ${format.url.replace(API_KEY, 'YOUR_API_KEY')}`);
        console.log(`Auth after connect: ${format.authAfterConnect}`);
        console.log('');
        ws.close();
        process.exit(0);
      }, 3000);
    }
  });

  ws.on('message', (data) => {
    clearTimeout(timeout);
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received message:', JSON.stringify(message, null, 2));
      
      // If we get any message, the connection is working
      if (message[0]?.ev === 'status' && message[0]?.status === 'auth_success') {
        console.log('✅ Authentication successful!');
      } else if (message[0]?.ev === 'AM' || message[0]?.ev === 'A') {
        console.log('✅ Received aggregate data! Connection is working!');
      }
    } catch (error) {
      console.log('📨 Raw message:', data.toString().substring(0, 200));
    }
  });

  ws.on('error', (error) => {
    clearTimeout(timeout);
    console.log(`❌ Error: ${error.message}`);
    
    if (error.message.includes('404')) {
      console.log('   → 404 Not Found - URL format incorrect');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.log('   → Authentication failed - check API key');
    } else {
      console.log('   → Connection failed');
    }
    
    console.log('   → Trying next format...');
    currentTest++;
    setTimeout(() => testNextUrl(), 1000);
  });

  ws.on('close', (code, reason) => {
    clearTimeout(timeout);
    if (code === 1000) {
      // Normal closure - might be success
      return;
    }
    if (currentTest < urlFormats.length - 1) {
      console.log(`🔌 Closed: ${code} - ${reason || 'No reason'}`);
      console.log('   → Trying next format...');
      currentTest++;
      setTimeout(() => testNextUrl(), 1000);
    }
  });
}

console.log('==========================================');
console.log('Testing Multiple WebSocket URL Formats');
console.log('==========================================');
console.log('');
console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
console.log(`Testing ${urlFormats.length} different URL formats...`);
console.log('');

testNextUrl();
