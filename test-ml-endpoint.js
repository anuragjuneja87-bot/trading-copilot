#!/usr/bin/env node
/**
 * ML Endpoint Diagnostic Script
 * 
 * Run: node test-ml-endpoint.js
 * 
 * Tests connectivity and payload format against the tradeyodha-prediction
 * endpoint on your personal Databricks workspace.
 * 
 * Reads from .env file automatically.
 */

const fs = require('fs');
const path = require('path');

// ── Load .env ──
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ No .env file found. Create one with DATABRICKS_ML_HOST, DATABRICKS_ML_TOKEN, DATABRICKS_ML_ENDPOINT');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      process.env[key] = value;
    }
  }
}

loadEnv();

const ML_HOST = process.env.DATABRICKS_ML_HOST;
const ML_TOKEN = process.env.DATABRICKS_ML_TOKEN;
const ML_ENDPOINT = process.env.DATABRICKS_ML_ENDPOINT || 'tradeyodha-prediction';

console.log('\n🔍 ML ENDPOINT DIAGNOSTICS');
console.log('═'.repeat(60));
console.log(`DATABRICKS_ML_HOST:     ${ML_HOST ? '✅ ' + ML_HOST.substring(0, 50) : '❌ NOT SET'}`);
console.log(`DATABRICKS_ML_TOKEN:    ${ML_TOKEN ? '✅ ' + ML_TOKEN.substring(0, 8) + '...' : '❌ NOT SET'}`);
console.log(`DATABRICKS_ML_ENDPOINT: ${ML_ENDPOINT}`);

if (!ML_HOST || !ML_TOKEN) {
  console.error('\n❌ Missing required env vars. Cannot continue.');
  process.exit(1);
}

const ENDPOINT_URL = `${ML_HOST}/serving-endpoints/${ML_ENDPOINT}/invocations`;
console.log(`\nEndpoint URL: ${ENDPOINT_URL}`);
console.log('═'.repeat(60));

// ── Dummy features (34 features matching the LightGBM model) ──
const DUMMY_FEATURES = {
  volume_vs_20d_avg: 1.2,
  price_vs_vwap_pct: 0.15,
  relative_strength_vs_spy: -0.5,
  intraday_range_pct: 1.8,
  momentum_30m: -0.3,
  momentum_1h: -0.6,
  gap_pct: -1.5,
  short_volume_ratio: null,
  dark_pool_pct: null,
  block_trade_ratio: null,
  premarket_volume_ratio: 1.5,
  premarket_change_pct: -1.5,
  premarket_range_pct: null,
  vix_level: null,
  vix_percentile_252d: null,
  vix_term_structure: null,
  yield_10y: null,
  yield_curve_spread: null,
  inflation_trend: null,
  days_to_next_fomc: 15,
  day_of_week: 1,
  time_of_day_bucket: 2,
  call_wall_distance_pct: 2.8,
  put_wall_distance_pct: -9.0,
  is_fomc_day: 0,
  is_fomc_week: 0,
  is_opex_week: 0,
  momentum_x_vix: null,
  momentum_x_range: -0.54,
  gap_x_pm_volume: -2.25,
  gap_x_pm_range: null,
  vwap_x_volume: 0.18,
  rs_x_momentum: 0.3,
  pm_change_x_gap: 2.25,
};

// ── Test payloads in different formats ──
const PAYLOAD_FORMATS = [
  {
    name: 'dataframe_records (standard MLflow)',
    body: { dataframe_records: [DUMMY_FEATURES] },
  },
  {
    name: 'dataframe_split (column-oriented)',
    body: {
      dataframe_split: {
        columns: Object.keys(DUMMY_FEATURES),
        data: [Object.values(DUMMY_FEATURES)],
      },
    },
  },
  {
    name: 'instances (TensorFlow-style)',
    body: { instances: [DUMMY_FEATURES] },
  },
  {
    name: 'input (custom Flask app)',
    body: { input: DUMMY_FEATURES },
  },
];

async function testEndpoint() {
  // ── Test 1: Basic connectivity ──
  console.log('\n📡 Test 1: Basic connectivity to Databricks host...');
  try {
    const healthUrl = `${ML_HOST}/api/2.0/serving-endpoints/${ML_ENDPOINT}`;
    const healthRes = await fetch(healthUrl, {
      headers: { Authorization: `Bearer ${ML_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });
    const healthData = await healthRes.json();
    
    if (healthRes.ok) {
      console.log(`   ✅ Endpoint exists! State: ${healthData.state?.ready || healthData.state?.config_update || 'unknown'}`);
      if (healthData.state?.ready === 'READY') {
        console.log('   ✅ Endpoint is READY and serving');
      } else {
        console.log(`   ⚠️  Endpoint state: ${JSON.stringify(healthData.state)}`);
      }
      // Show model info
      if (healthData.config?.served_entities?.[0]) {
        const entity = healthData.config.served_entities[0];
        console.log(`   Model: ${entity.entity_name || 'unknown'} v${entity.entity_version || '?'}`);
      }
    } else if (healthRes.status === 404) {
      console.log(`   ❌ Endpoint "${ML_ENDPOINT}" NOT FOUND (404)`);
      console.log('   → Check the endpoint name in Databricks ML > Serving');
      return;
    } else if (healthRes.status === 401 || healthRes.status === 403) {
      console.log(`   ❌ Authentication failed (${healthRes.status})`);
      console.log('   → Check that DATABRICKS_ML_TOKEN is a valid PAT for this workspace');
      return;
    } else {
      console.log(`   ⚠️  Got ${healthRes.status}: ${JSON.stringify(healthData).substring(0, 200)}`);
    }
  } catch (err) {
    console.log(`   ❌ Cannot reach host: ${err.message}`);
    if (err.name === 'TimeoutError') {
      console.log('   → Timeout! Check if the URL is correct and accessible');
    }
    return;
  }

  // ── Test 2: Try each payload format ──
  console.log('\n📤 Test 2: Trying payload formats...');
  
  for (const format of PAYLOAD_FORMATS) {
    console.log(`\n   → ${format.name}:`);
    
    try {
      const start = Date.now();
      const res = await fetch(ENDPOINT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ML_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(format.body),
        signal: AbortSignal.timeout(30000), // 30s for cold start
      });
      
      const latency = Date.now() - start;
      const text = await res.text();
      
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      
      if (res.ok) {
        console.log(`     ✅ SUCCESS (${latency}ms)`);
        console.log(`     Response: ${text.substring(0, 300)}`);
        
        // Check response structure
        if (parsed?.predictions) {
          console.log(`     → Format: { predictions: [...] } — ${parsed.predictions.length} items`);
          console.log(`     → First prediction:`, JSON.stringify(parsed.predictions[0]).substring(0, 200));
        } else if (Array.isArray(parsed)) {
          console.log(`     → Format: Array — ${parsed.length} items`);
          console.log(`     → First item:`, JSON.stringify(parsed[0]).substring(0, 200));
        } else {
          console.log(`     → Format: ${typeof parsed} — keys: ${parsed ? Object.keys(parsed).join(', ') : 'N/A'}`);
        }
        
        console.log('\n   ✅ WORKING FORMAT FOUND: ' + format.name);
        console.log('   Use this format in the predict route.');
        return; // Found working format, stop
      } else {
        console.log(`     ❌ ${res.status} ${res.statusText} (${latency}ms)`);
        console.log(`     Error: ${text.substring(0, 300)}`);
        
        if (res.status === 503) {
          console.log('     → Endpoint is warming up (cold start). Wait 30-60s and retry.');
        }
      }
    } catch (err) {
      console.log(`     ❌ ${err.name}: ${err.message}`);
    }
  }
  
  console.log('\n❌ No payload format worked. Check the model signature in Databricks.');

  // ── Test 3: Check what the model expects ──
  console.log('\n📋 Test 3: Checking model signature...');
  try {
    const sigUrl = `${ML_HOST}/api/2.0/serving-endpoints/${ML_ENDPOINT}`;
    const sigRes = await fetch(sigUrl, {
      headers: { Authorization: `Bearer ${ML_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });
    const sigData = await sigRes.json();
    
    if (sigData.config?.served_entities?.[0]) {
      const entity = sigData.config.served_entities[0];
      console.log(`   Entity: ${entity.entity_name} v${entity.entity_version}`);
    }
    
    // Try to get model input schema
    if (sigData.config?.served_entities?.[0]?.entity_name) {
      const modelName = sigData.config.served_entities[0].entity_name;
      const version = sigData.config.served_entities[0].entity_version;
      console.log(`   → To check input schema, run in Databricks:`);
      console.log(`     import mlflow`);
      console.log(`     model = mlflow.pyfunc.load_model(f"models:/${modelName}/${version}")`);
      console.log(`     print(model.metadata.get_input_schema())`);
    }
  } catch (err) {
    console.log(`   Could not fetch model info: ${err.message}`);
  }
}

testEndpoint().catch(err => {
  console.error('\n💥 Unexpected error:', err);
  process.exit(1);
});
