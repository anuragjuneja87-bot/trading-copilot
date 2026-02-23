#!/usr/bin/env node
/**
 * ML Endpoint Debug Script — Targeted tests for timeout issue
 * 
 * The endpoint is READY but invocations hang. Let's figure out why.
 * Run: node test-ml-debug.js
 */

const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) process.env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
  }
}

const ML_HOST = process.env.DATABRICKS_ML_HOST;
const ML_TOKEN = process.env.DATABRICKS_ML_TOKEN;
const ML_ENDPOINT = process.env.DATABRICKS_ML_ENDPOINT || 'tradeyodha-prediction';
const ENDPOINT_URL = `${ML_HOST}/serving-endpoints/${ML_ENDPOINT}/invocations`;

console.log('\n🔬 ML ENDPOINT DEBUG — Targeted Timeout Investigation');
console.log('═'.repeat(60));
console.log(`Model: tradeyodha.ml.prediction_pipeline_v3 v2`);
console.log(`URL: ${ENDPOINT_URL}`);
console.log('═'.repeat(60));

// ── Feature sets to test ──

// Test A: All zeros (no nulls) — if this works, nulls are the problem
const ALL_ZEROS = {
  volume_vs_20d_avg: 1.0,
  price_vs_vwap_pct: 0.0,
  relative_strength_vs_spy: 0.0,
  intraday_range_pct: 1.0,
  momentum_30m: 0.0,
  momentum_1h: 0.0,
  gap_pct: 0.0,
  short_volume_ratio: 0.0,
  dark_pool_pct: 0.0,
  block_trade_ratio: 0.0,
  premarket_volume_ratio: 1.0,
  premarket_change_pct: 0.0,
  premarket_range_pct: 0.0,
  vix_level: 20.0,
  vix_percentile_252d: 50.0,
  vix_term_structure: 1.0,
  yield_10y: 4.0,
  yield_curve_spread: 0.5,
  inflation_trend: 0.0,
  days_to_next_fomc: 15,
  day_of_week: 1,
  time_of_day_bucket: 2,
  call_wall_distance_pct: 2.0,
  put_wall_distance_pct: -5.0,
  is_fomc_day: 0,
  is_fomc_week: 0,
  is_opex_week: 0,
  momentum_x_vix: 0.0,
  momentum_x_range: 0.0,
  gap_x_pm_volume: 0.0,
  gap_x_pm_range: 0.0,
  vwap_x_volume: 0.0,
  rs_x_momentum: 0.0,
  pm_change_x_gap: 0.0,
};

// Test B: With nulls (matches real app behavior)
const WITH_NULLS = { ...ALL_ZEROS };
WITH_NULLS.short_volume_ratio = null;
WITH_NULLS.dark_pool_pct = null;
WITH_NULLS.block_trade_ratio = null;
WITH_NULLS.premarket_range_pct = null;
WITH_NULLS.vix_level = null;
WITH_NULLS.vix_percentile_252d = null;
WITH_NULLS.vix_term_structure = null;
WITH_NULLS.yield_10y = null;
WITH_NULLS.yield_curve_spread = null;
WITH_NULLS.inflation_trend = null;
WITH_NULLS.momentum_x_vix = null;
WITH_NULLS.gap_x_pm_range = null;

// Test C: With NaN strings (in case model expects this)
const WITH_NAN_STRINGS = { ...ALL_ZEROS };
WITH_NAN_STRINGS.short_volume_ratio = 'NaN';
WITH_NAN_STRINGS.dark_pool_pct = 'NaN';

// Test D: Minimal — just a few features
const MINIMAL = {
  volume_vs_20d_avg: 1.0,
  price_vs_vwap_pct: 0.0,
  relative_strength_vs_spy: 0.0,
};

// Test E: Empty object
const EMPTY = {};

async function testPayload(name, features, format, timeoutMs = 90000) {
  let body;
  if (format === 'dataframe_records') {
    body = { dataframe_records: [features] };
  } else if (format === 'dataframe_split') {
    body = { dataframe_split: { columns: Object.keys(features), data: [Object.values(features)] } };
  } else if (format === 'instances') {
    body = { instances: [features] };
  } else if (format === 'input') {
    body = { input: features };
  }

  const start = Date.now();
  process.stdout.write(`   ${name} [${format}] ... `);

  try {
    const res = await fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ML_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const text = await res.text();

    if (res.ok) {
      console.log(`✅ ${res.status} (${elapsed}s)`);
      console.log(`     Response: ${text.substring(0, 400)}`);
      return { success: true, status: res.status, elapsed, text };
    } else {
      console.log(`❌ ${res.status} (${elapsed}s)`);
      console.log(`     Error: ${text.substring(0, 400)}`);
      return { success: false, status: res.status, elapsed, text };
    }
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`❌ ${err.name} (${elapsed}s) — ${err.message}`);
    return { success: false, error: err.name, elapsed };
  }
}

async function run() {
  // ── Step 1: Check model input schema via the API ──
  console.log('\n📋 Step 1: Checking model input schema...');
  try {
    const url = `${ML_HOST}/api/2.0/serving-endpoints/${ML_ENDPOINT}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ML_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    
    const entity = data.config?.served_entities?.[0];
    if (entity) {
      console.log(`   Entity: ${entity.entity_name} v${entity.entity_version}`);
      console.log(`   Workload size: ${entity.workload_size || 'default'}`);
      console.log(`   Scale to zero: ${entity.scale_to_zero_enabled}`);
    }

    // Check pending config (maybe it's updating)
    if (data.pending_config) {
      console.log(`   ⚠️  PENDING CONFIG UPDATE — model might be redeploying`);
    }

    // Check state details
    if (data.state) {
      console.log(`   State: ready=${data.state.ready}, config_update=${data.state.config_update || 'NONE'}`);
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }

  // ── Step 2: Quick connectivity sanity check ──
  console.log('\n📡 Step 2: Quick sanity check (empty payload, expect 400)...');
  await testPayload('Empty body', EMPTY, 'dataframe_records', 15000);

  // ── Step 3: Test with all-zeros (no nulls) ──
  console.log('\n🧪 Step 3: All-zeros features (no nulls — 90s timeout)...');
  const zeroResult = await testPayload('All zeros', ALL_ZEROS, 'dataframe_records', 90000);

  if (zeroResult.success) {
    console.log('\n   ✅ All-zeros works! Now testing with nulls...');
    
    // ── Step 4: Test with nulls ──
    console.log('\n🧪 Step 4: Features with null values...');
    await testPayload('With nulls', WITH_NULLS, 'dataframe_records', 90000);
    return;
  }

  // If all-zeros also timed out, try other formats
  if (zeroResult.error === 'TimeoutError') {
    console.log('\n   ⏰ All-zeros also timed out. Trying different formats...');
    
    console.log('\n🧪 Step 4a: dataframe_split format...');
    const splitResult = await testPayload('All zeros', ALL_ZEROS, 'dataframe_split', 90000);
    
    if (!splitResult.success) {
      console.log('\n🧪 Step 4b: instances format...');
      const instResult = await testPayload('All zeros', ALL_ZEROS, 'instances', 90000);
      
      if (!instResult.success) {
        console.log('\n🧪 Step 4c: input format (Flask-style)...');
        await testPayload('All zeros', ALL_ZEROS, 'input', 90000);
      }
    }
  }

  // ── Step 5: Try minimal features ──
  if (zeroResult.error === 'TimeoutError') {
    console.log('\n🧪 Step 5: Minimal features (only 3)...');
    await testPayload('Minimal', MINIMAL, 'dataframe_records', 90000);
  }

  // ── Summary ──
  console.log('\n' + '═'.repeat(60));
  console.log('📝 SUMMARY:');
  console.log('   The model endpoint is READY but invocations are timing out.');
  console.log('   Possible causes:');
  console.log('   1. The pyfunc predict() is doing something expensive (API calls, data loading)');
  console.log('   2. The model signature requires features in a specific format');
  console.log('   3. The serving compute is too small (check workload_size)');
  console.log('   4. The model is stuck in an error loop (check Databricks Serving Logs)');
  console.log('');
  console.log('   → CHECK LOGS: Databricks → ML → Serving → tradeyodha-prediction → Logs');
  console.log('   → The logs will show the actual Python error/traceback');
}

run().catch(err => {
  console.error('\n💥 Error:', err);
});
