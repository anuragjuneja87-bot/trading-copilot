/**
 * POST /api/ml/predict
 *
 * Accepts war room snapshot, assembles features, calls the
 * tradeyodha-prediction endpoint on the personal Databricks workspace.
 *
 * Env vars:
 *   DATABRICKS_ML_HOST     — Personal workspace URL
 *   DATABRICKS_ML_TOKEN    — Personal workspace PAT
 *   DATABRICKS_ML_ENDPOINT — "tradeyodha-prediction"
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  assembleFeatures,
  type WarRoomSnapshot,
  type MarketRegimeData,
} from '@/lib/feature-assembler';

// ─── Config ──────────────────────────────────────────────────────────

const ML_HOST = process.env.DATABRICKS_ML_HOST;
const ML_TOKEN = process.env.DATABRICKS_ML_TOKEN;
const ML_ENDPOINT = process.env.DATABRICKS_ML_ENDPOINT || 'tradeyodha-prediction';

// ─── Types ───────────────────────────────────────────────────────────

interface PredictRequest {
  snapshot: WarRoomSnapshot;
  regime?: MarketRegimeData | null;
}

export interface MLPrediction {
  move_probability: number;
  has_signal: boolean;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  direction_confidence: number;
  signal_strength: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

interface PredictResponse {
  success: boolean;
  prediction?: MLPrediction;
  meta?: {
    completeness: string;
    availableFeatures: number;
    latencyMs: number;
    endpoint: string;
  };
  error?: string;
}

// ─── Route Handler ───────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<PredictResponse>> {
  const start = Date.now();

  // Validate config
  if (!ML_HOST || !ML_TOKEN) {
    return NextResponse.json(
      {
        success: false,
        error: 'ML endpoint not configured. Set DATABRICKS_ML_HOST and DATABRICKS_ML_TOKEN.',
      },
      { status: 503 }
    );
  }

  try {
    const body: PredictRequest = await req.json();

    if (!body.snapshot?.ticker || !body.snapshot?.price) {
      return NextResponse.json(
        { success: false, error: 'Missing ticker or price in snapshot' },
        { status: 400 }
      );
    }

    // ── Step 1: Assemble features ──
    const { features, completeness, availableCount } = assembleFeatures(
      body.snapshot,
      body.regime
    );

    // ── Step 2: Call Databricks endpoint ──
    const endpointUrl = `${ML_HOST}/serving-endpoints/${ML_ENDPOINT}/invocations`;

    // Convert null values to NaN for LightGBM compatibility
    // LightGBM handles NaN natively, but JSON null can cause issues
    const cleanedFeatures: Record<string, any> = {};
    for (const [key, value] of Object.entries(features)) {
      cleanedFeatures[key] = value === null || value === undefined ? 'NaN' : value;
    }

    console.log('[ML Predict] Calling endpoint:', ML_ENDPOINT);
    console.log('[ML Predict] Feature completeness:', completeness);
    console.log('[ML Predict] Available features:', availableCount);

    // Try standard Databricks model serving format first
    let dbResponse: Response;
    let payloadFormat: string;

    try {
      // Standard Databricks model serving format
      payloadFormat = 'dataframe_records';
      dbResponse = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ML_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataframe_records: [cleanedFeatures],
        }),
        signal: AbortSignal.timeout(15000),
      });

      // If the standard format returns 400, try the "input" format
      // (used by some custom Databricks Apps / Flask endpoints)
      if (dbResponse.status === 400 || dbResponse.status === 422) {
        const errText = await dbResponse.text();
        console.warn('[ML Predict] Standard format failed, trying "input" format. Error:', errText);
        
        payloadFormat = 'input';
        dbResponse = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ML_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: cleanedFeatures,
          }),
          signal: AbortSignal.timeout(15000),
        });
      }
    } catch (fetchErr: any) {
      // If the main endpoint fails, try the Databricks Apps endpoint format
      if (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError') {
        console.error('[ML Predict] Timeout on endpoint:', ML_ENDPOINT);
        throw fetchErr;
      }
      throw fetchErr;
    }

    console.log('[ML Predict] Response status:', dbResponse.status, 'format:', payloadFormat);

    if (!dbResponse.ok) {
      const errText = await dbResponse.text();
      console.error('[ML Predict] Databricks error:', dbResponse.status, errText);

      // If endpoint is scaling from zero, return a graceful fallback
      if (dbResponse.status === 503 || dbResponse.status === 504) {
        return NextResponse.json(
          {
            success: false,
            error: 'ML endpoint warming up. Try again in 30 seconds.',
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { success: false, error: `Databricks returned ${dbResponse.status}` },
        { status: 502 }
      );
    }

    const result = await dbResponse.json();

    // ── Step 3: Parse prediction ──
    // Endpoint returns: { predictions: [{ move_probability, has_signal, direction, ... }] }
    // or: { dataframe_records: [...] } depending on the output format
    let rawPrediction: any;

    if (result.predictions && Array.isArray(result.predictions)) {
      rawPrediction = result.predictions[0];
    } else if (result.dataframe_records && Array.isArray(result.dataframe_records)) {
      rawPrediction = result.dataframe_records[0];
    } else if (Array.isArray(result)) {
      rawPrediction = result[0];
    } else {
      // Try to extract from nested structure
      rawPrediction = result;
    }

    const prediction: MLPrediction = {
      move_probability: rawPrediction?.move_probability ?? 0.5,
      has_signal: rawPrediction?.has_signal ?? false,
      direction: rawPrediction?.direction ?? 'NEUTRAL',
      direction_confidence: rawPrediction?.direction_confidence ?? 0.5,
      signal_strength: rawPrediction?.signal_strength ?? 'NONE',
    };

    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      prediction,
      meta: {
        completeness,
        availableFeatures: availableCount,
        latencyMs,
        endpoint: ML_ENDPOINT,
      },
    });
  } catch (err: any) {
    console.error('[ML Predict] Error:', err);

    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'ML prediction timed out (15s)' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { success: false, error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
