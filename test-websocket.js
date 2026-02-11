/**
 * Test WebSocket connection to Massive.com Options Flow
 * 
 * Usage: node test-websocket.js
 * 
 * Make sure NEXT_PUBLIC_MASSIVE_API_KEY is set in .env or pass as argument:
 * NEXT_PUBLIC_MASSIVE_API_KEY=your_key node test-websocket.js
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Load .env file manually (no dotenv dependency needed)
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

const API_KEY = process.env.NEXT_PUBLIC_MASSIVE_API_KEY || process.argv[2];
const WS_URL = process.env.NEXT_PUBLIC_MASSIVE_WS_URL || 'wss://socket.massive.com';
const MODE = process.argv[3] || 'AM'; // 'A' for per-second, 'AM' for per-minute

if (!API_KEY || API_KEY.includes('your_')) {
  console.error('❌ Error: NEXT_PUBLIC_MASSIVE_API_KEY not set');
  console.log('Set it in .env file or pass as argument:');
  console.log('  NEXT_PUBLIC_MASSIVE_API_KEY=your_key node test-websocket.js');
  process.exit(1);
}

// Try Polygon.io format first (most common)
// Format: wss://socket.polygon.io/options/AM?apiKey=KEY
const wsUrl = `${WS_URL}/options/${MODE}?apiKey=${API_KEY}`;
console.log(`Attempting connection to: ${WS_URL}/options/${MODE}`);

console.log('==========================================');
console.log('Testing Massive.com WebSocket Options Flow');
console.log('==========================================');
console.log('');
console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
console.log(`WebSocket URL: ${WS_URL}/options/${MODE}`);
console.log(`Mode: ${MODE === 'A' ? 'Per-second' : 'Per-minute'} aggregates`);
console.log('');

// Create WebSocket connection
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connected!');
  console.log('');
  
  // Polygon.io requires authentication after connection
  console.log('🔐 Authenticating...');
  const authMsg = {
    action: 'auth',
    params: API_KEY,
  };
  ws.send(JSON.stringify(authMsg));
  console.log('');
  
  // Wait for auth, then subscribe
  setTimeout(() => {
    // Subscribe to a test option contract
    // Format: O:SPY240119C00450000 (O: + ticker + expiry + C/P + strike)
    const testContract = 'O:SPY240119C00450000'; // Example: SPY Jan 19 2024 $450 Call
    
    console.log(`📡 Subscribing to: ${testContract}`);
    console.log('');
    
    // Polygon.io format: {"action":"subscribe","params":"AM.O:SPY240119C00450000"}
    const subscribeMsg = {
      action: 'subscribe',
      params: `${MODE}.${testContract}`, // Format: AM.O:SPY240119C00450000
    };
    
    ws.send(JSON.stringify(subscribeMsg));
    
    // Also try subscribing to all SPY contracts (if supported)
    setTimeout(() => {
      console.log('📡 Subscribing to all SPY contracts (wildcard)...');
      const wildcardMsg = {
        action: 'subscribe',
        params: `${MODE}.O:SPY*`, // Wildcard for all SPY contracts
      };
      ws.send(JSON.stringify(wildcardMsg));
    }, 2000);
  }, 1000); // Wait 1s for auth to complete
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    console.log('📨 Received message:');
    console.log(JSON.stringify(message, null, 2));
    console.log('');
    
    // Parse aggregate data
    if (message.ev === 'A' || message.ev === 'AM') {
      const { sym, v, av, c, o, h, l, vw, s, e } = message;
      const timestamp = new Date(s).toISOString();
      const premium = c * v * 100; // Price * Volume * 100
      
      console.log(`  Contract: ${sym}`);
      console.log(`  Volume: ${v} (Total: ${av})`);
      console.log(`  Price: $${c.toFixed(2)} (Open: $${o.toFixed(2)}, High: $${h.toFixed(2)}, Low: $${l.toFixed(2)})`);
      console.log(`  Premium: $${premium.toLocaleString()}`);
      console.log(`  VWAP: $${vw.toFixed(2)}`);
      console.log(`  Time: ${timestamp}`);
      console.log('');
    }
  } catch (error) {
    console.log('📨 Raw message:', data.toString());
    console.log('');
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.log('');
  console.log('Troubleshooting:');
  console.log('  1. Check if API key is correct');
  console.log('  2. Verify WebSocket URL is correct');
  console.log('  3. Check if your plan includes WebSocket access');
  console.log('  4. Ensure market is open (WebSocket may only stream during market hours)');
});

ws.on('close', (code, reason) => {
  console.log('');
  console.log(`🔌 WebSocket closed: ${code} - ${reason || 'No reason provided'}`);
  console.log('');
  console.log('Test complete!');
});

// Keep connection alive
process.on('SIGINT', () => {
  console.log('');
  console.log('Closing connection...');
  ws.close();
  process.exit(0);
});

// Timeout after 30 seconds if no data
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('');
    console.log('⏱️  No data received in 30 seconds. Connection may be working but no trades occurred.');
    console.log('   Try during market hours or with a more active contract.');
  }
}, 30000);
