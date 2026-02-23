/**
 * ML Signal Panel — Displays the B→C pipeline prediction
 *
 * Shows: move probability gauge, direction call, signal strength,
 * confidence, and feature completeness.
 *
 * Designed to match the existing dark trading terminal aesthetic.
 */

'use client';

import { useMLPrediction } from '@/hooks/use-ml-prediction';
import type { MLPrediction } from '@/app/api/ml/predict/route';

interface MLSignalPanelProps {
  ticker: string;
  warRoomData: any;
  /** When provided by parent (e.g. ask page), use these instead of calling the hook */
  prediction?: MLPrediction | null;
  isLoading?: boolean;
  error?: string | null;
  meta?: { completeness: string; availableFeatures: number; latencyMs: number } | null;
  refresh?: () => void;
  lastUpdate?: Date | null;
}

/** When parent passes refresh, use lifted state (no hook). Otherwise use internal hook. */
export function MLSignalPanel(props: MLSignalPanelProps) {
  if (props.refresh !== undefined) {
    return (
      <MLSignalPanelView
        prediction={props.prediction ?? null}
        isLoading={props.isLoading ?? false}
        error={props.error ?? null}
        meta={props.meta ?? null}
        refresh={props.refresh}
        lastUpdate={props.lastUpdate ?? null}
      />
    );
  }
  return <MLSignalPanelWithHook ticker={props.ticker} warRoomData={props.warRoomData} />;
}

function MLSignalPanelWithHook({ ticker, warRoomData }: { ticker: string; warRoomData: any }) {
  const { prediction, isLoading, error, meta, refresh, lastUpdate } = useMLPrediction(ticker, warRoomData);
  return (
    <MLSignalPanelView
      prediction={prediction}
      isLoading={isLoading}
      error={error}
      meta={meta}
      refresh={refresh}
      lastUpdate={lastUpdate}
    />
  );
}

interface MLSignalPanelViewProps {
  prediction: MLPrediction | null;
  isLoading: boolean;
  error: string | null;
  meta: { completeness: string; availableFeatures: number; latencyMs: number } | null;
  refresh: () => void;
  lastUpdate: Date | null;
}

function MLSignalPanelView({
  prediction,
  isLoading,
  error,
  meta,
  refresh,
  lastUpdate,
}: MLSignalPanelViewProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
          <h3 className="text-sm font-semibold text-zinc-300 tracking-wide uppercase">
            ML Signal
          </h3>
          <span className="text-[10px] text-zinc-600 font-mono">B→C Pipeline</span>
        </div>
        <div className="flex items-center gap-2">
          {meta && (
            <span className="text-[10px] text-zinc-600 font-mono">
              {meta.completeness} features · {meta.latencyMs}ms
            </span>
          )}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30"
            title="Refresh prediction"
          >
            <svg
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && !prediction && (
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          <span className="ml-2 text-xs text-zinc-500">Analyzing...</span>
        </div>
      )}

      {/* Error state */}
      {error && !prediction && (
        <div className="py-4 text-center">
          <p className="text-xs text-amber-500/70">{error}</p>
          <button
            onClick={refresh}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Prediction display */}
      {prediction && <PredictionDisplay prediction={prediction} isStale={isLoading} />}

      {/* Last updated */}
      {lastUpdate && (
        <div className="mt-2 text-right">
          <span className="text-[10px] text-zinc-600 font-mono">
            {lastUpdate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZone: 'America/New_York',
            })}{' '}
            ET
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Prediction Display ──────────────────────────────────────────────

function PredictionDisplay({
  prediction,
  isStale,
}: {
  prediction: MLPrediction;
  isStale: boolean;
}) {
  const {
    move_probability,
    has_signal,
    direction,
    direction_confidence,
    signal_strength,
  } = prediction;

  const directionColor =
    direction === 'BULLISH'
      ? 'text-emerald-400'
      : direction === 'BEARISH'
        ? 'text-red-400'
        : 'text-zinc-500';

  const directionBg =
    direction === 'BULLISH'
      ? 'bg-emerald-500/10 border-emerald-500/20'
      : direction === 'BEARISH'
        ? 'bg-red-500/10 border-red-500/20'
        : 'bg-zinc-800/50 border-zinc-700/30';

  const strengthColor = {
    HIGH: 'text-amber-400',
    MEDIUM: 'text-violet-400',
    LOW: 'text-zinc-400',
    NONE: 'text-zinc-600',
  }[signal_strength];

  return (
    <div className={`space-y-3 ${isStale ? 'opacity-60' : ''}`}>
      {/* Move Probability Bar */}
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[11px] text-zinc-500">Move Probability</span>
          <span className="text-sm font-mono font-bold text-zinc-200">
            {(move_probability * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.min(move_probability * 100, 100)}%`,
              background: move_probability >= 0.8
                ? 'linear-gradient(90deg, #8b5cf6, #a78bfa)'
                : move_probability >= 0.7
                  ? 'linear-gradient(90deg, #6366f1, #818cf8)'
                  : move_probability >= 0.5
                    ? '#52525b'
                    : '#3f3f46',
            }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] text-zinc-700 font-mono">
          <span>0%</span>
          <span className="text-zinc-600">80% threshold</span>
          <span>100%</span>
        </div>
      </div>

      {/* Direction + Signal */}
      {has_signal ? (
        <div className={`rounded-md border p-3 ${directionBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${directionColor}`}>
                {direction === 'BULLISH' ? '▲' : '▼'} {direction}
              </span>
            </div>
            <div className="text-right">
              <div className={`text-xs font-semibold ${strengthColor}`}>
                {signal_strength} SIGNAL
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">
                {(direction_confidence * 100).toFixed(0)}% confidence
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-zinc-800 bg-zinc-800/30 p-3 text-center">
          <span className="text-xs text-zinc-500">
            No signal — move probability below 80% threshold
          </span>
        </div>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox
          label="Signal"
          value={signal_strength}
          color={strengthColor}
        />
        <StatBox
          label="Direction"
          value={has_signal ? direction.slice(0, 4) : '—'}
          color={has_signal ? directionColor : 'text-zinc-600'}
        />
        <StatBox
          label="Confidence"
          value={has_signal ? `${(direction_confidence * 100).toFixed(0)}%` : '—'}
          color={has_signal ? 'text-zinc-200' : 'text-zinc-600'}
        />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-center">
      <div className="text-[9px] text-zinc-600 uppercase tracking-wider">{label}</div>
      <div className={`text-xs font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}

export default MLSignalPanel;
