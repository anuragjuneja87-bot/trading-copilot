/**
 * Check if API key is valid and get WebSocket info from REST API
 */

const https = require('https');
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
  process.exit(1);
}

console.log('==========================================');
console.log('Checking API Key & WebSocket Info');
console.log('==========================================');
console.log('');
console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
console.log('');

// Test 1: Check if API key works with Polygon.io REST API
console.log('1. Testing Polygon.io REST API...');
console.log('----------------------------------------');

const polygonUrl = `https://api.polygon.io/v3/snapshot/options/SPY?limit=1&apiKey=${API_KEY}`;

https.get(polygonUrl, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      
      if (json.status === 'OK' || json.results) {
        console.log('✅ Polygon.io REST API works!');
        console.log(`   Status: ${json.status || 'OK'}`);
        console.log('');
        console.log('   → Your API key is valid for Polygon.io');
        console.log('   → WebSocket should use: wss://socket.polygon.io');
        console.log('');
      } else if (json.status === 'ERROR') {
        console.log('❌ Polygon.io API Error:', json.error || json.message);
        console.log('');
      } else {
        console.log('⚠️  Unexpected response:', JSON.stringify(json).substring(0, 200));
        console.log('');
      }
    } catch (error) {
      console.log('⚠️  Could not parse response:', data.substring(0, 200));
      console.log('');
    }
    
    // Test 2: Try Massive.com REST API (if different)
    console.log('2. Testing Massive.com REST API (if different)...');
    console.log('----------------------------------------');
    
    // Try common Massive.com endpoints
    const massiveEndpoints = [
      `https://api.massive.com/v1/options/snapshot?ticker=SPY&apiKey=${API_KEY}`,
      `https://massive.com/api/v1/options/snapshot?ticker=SPY&apiKey=${API_KEY}`,
      `https://api.massive.com/options/snapshot?ticker=SPY&apiKey=${API_KEY}`,
    ];
    
    let tested = 0;
    massiveEndpoints.forEach((url, index) => {
      https.get(url, (res) => {
        tested++;
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`✅ Found working endpoint: ${url.replace(API_KEY, '***')}`);
            console.log('');
          } else if (tested === massiveEndpoints.length) {
            console.log('⚠️  Massive.com REST endpoints not found or different');
            console.log('');
            printRecommendations();
          }
        });
      }).on('error', () => {
        tested++;
        if (tested === massiveEndpoints.length) {
          printRecommendations();
        }
      });
    });
  });
}).on('error', (error) => {
  console.log('❌ Error connecting to Polygon.io:', error.message);
  console.log('');
  printRecommendations();
});

function printRecommendations() {
  console.log('==========================================');
  console.log('Recommendations');
  console.log('==========================================');
  console.log('');
  console.log('Since WebSocket URLs returned 404, try:');
  console.log('');
  console.log('1. Check your Massive.com/Polygon.io dashboard:');
  console.log('   - Look for "WebSocket" or "Real-time" section');
  console.log('   - Check API documentation for WebSocket endpoint');
  console.log('   - Verify your plan includes WebSocket access');
  console.log('');
  console.log('2. Verify API key format:');
  console.log('   - Polygon.io keys usually start with specific prefixes');
  console.log('   - Make sure you\'re using the correct key for WebSocket');
  console.log('');
  console.log('3. Check if WebSocket requires different authentication:');
  console.log('   - Some services use tokens instead of API keys');
  console.log('   - May need to generate a WebSocket-specific token');
  console.log('');
  console.log('4. Contact support:');
  console.log('   - Ask for the exact WebSocket URL');
  console.log('   - Verify WebSocket is included in your plan');
  console.log('   - Get example connection code');
  console.log('');
  console.log('5. Alternative: Use REST API polling for now');
  console.log('   - Your REST API is working');
  console.log('   - Can poll every 5-10 seconds for near real-time');
  console.log('   - Implement WebSocket later when endpoint is confirmed');
  console.log('');
}
