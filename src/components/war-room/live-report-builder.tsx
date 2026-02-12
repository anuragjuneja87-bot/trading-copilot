'use client';

interface LiveReportBuilderProps {
  ticker?: string;
  visibleRows?: number;
  showFlow?: boolean;
  showVerdict?: boolean;
  verdict?: {
    type: 'BUY' | 'SELL' | 'WAIT' | 'HOLD' | 'NEUTRAL';
    reasoning?: string;
  };
  marketData?: {
    previousClose?: string;
    gap?: string;
    sessionRange?: string;
    relativeVolume?: string;
    relStrength?: string;
  };
  optionsPositioning?: string;
}

const DEFAULT_REPORT_ROWS = [
  { label: 'Previous Close', value: '$670.72' },
  { label: 'Gap', value: '-0.27% (FLAT)' },
  { label: 'Session Range', value: '$657.10 – $679.27' },
  { label: 'Relative Volume', value: '1.0x (NORMAL)' },
  { label: 'Rel Strength vs SPY', value: '-0.25% (NEUTRAL)' },
];

export function LiveReportBuilder({
  ticker = 'META',
  visibleRows = 0,
  showFlow = false,
  showVerdict = false,
  verdict,
  marketData,
  optionsPositioning,
}: LiveReportBuilderProps) {
  const reportRows = marketData
    ? [
        { label: 'Previous Close', value: marketData.previousClose || '$—' },
        { label: 'Gap', value: marketData.gap || '—' },
        { label: 'Session Range', value: marketData.sessionRange || '—' },
        { label: 'Relative Volume', value: marketData.relativeVolume || '—' },
        { label: 'Rel Strength vs SPY', value: marketData.relStrength || '—' },
      ]
    : DEFAULT_REPORT_ROWS;

  const getVerdictColor = (type?: string) => {
    switch (type) {
      case 'BUY':
        return { bg: 'rgba(0,230,118,0.15)', border: 'rgba(0,230,118,0.3)', text: '#00e676', badge: '#00e676' };
      case 'SELL':
        return { bg: 'rgba(255,82,82,0.15)', border: 'rgba(255,82,82,0.3)', text: '#ff5252', badge: '#ff5252' };
      case 'WAIT':
        return { bg: 'rgba(255,193,7,0.15)', border: 'rgba(255,193,7,0.3)', text: '#ffc107', badge: '#ffc107' };
      default:
        return { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: '#8b99b0', badge: '#8b99b0' };
    }
  };

  const colors = getVerdictColor(verdict?.type);

  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ fontFamily: "'Oxanium', 'JetBrains Mono', monospace", fontSize: '12px', color: '#8b99b0' }}>
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid rgba(0,229,255,0.15)',
          paddingBottom: '10px',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            color: '#2a4a5a',
            letterSpacing: '2px',
            marginBottom: '4px',
            fontFamily: "'Oxanium', monospace",
            fontWeight: 700,
          }}
        >
          TRADING THESIS
        </div>
        <div
          style={{
            fontSize: '17px',
            fontWeight: 800,
            color: '#fff',
            letterSpacing: '1px',
            fontFamily: "'Oxanium', monospace",
          }}
        >
          {ticker} <span style={{ color: '#4a6070' }}>— {date}</span>
        </div>
      </div>

      {/* Market Data */}
      <div style={{ marginBottom: '16px' }}>
        <div
          style={{
            fontSize: '9px',
            color: '#00e5ff',
            letterSpacing: '1.5px',
            fontWeight: 700,
            marginBottom: '8px',
            fontFamily: "'Oxanium', monospace",
          }}
        >
          MARKET DATA
        </div>
        {reportRows.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '5px 0',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              opacity: i < visibleRows ? 1 : 0.15,
              transition: 'opacity 0.6s ease',
            }}
          >
            <span style={{ color: '#4a6070' }}>{row.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  color: i < visibleRows ? '#e0e6f0' : '#1a2a3a',
                  transition: 'color 0.6s ease',
                  fontWeight: 600,
                  fontFamily: "'Oxanium', monospace",
                }}
              >
                {i < visibleRows ? row.value : '░░░░░░'}
              </span>
              {i < visibleRows && (
                <span style={{ color: '#00e676', fontSize: '9px' }}>✓</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Options Positioning */}
      <div
        style={{
          marginBottom: '16px',
          opacity: showFlow ? 1 : 0.15,
          transition: 'opacity 0.8s ease',
        }}
      >
        <div
          style={{
            fontSize: '9px',
            color: '#00e5ff',
            letterSpacing: '1.5px',
            fontWeight: 700,
            marginBottom: '8px',
            fontFamily: "'Oxanium', monospace",
          }}
        >
          OPTIONS POSITIONING
        </div>
        {showFlow ? (
          <div
            style={{
              padding: '10px',
              borderRadius: '6px',
              background: 'rgba(0,229,255,0.03)',
              border: '1px solid rgba(0,229,255,0.06)',
              fontSize: '11px',
              lineHeight: '1.6',
              color: '#8b99b0',
            }}
          >
            {optionsPositioning || '62% calls · $45M premium · Institutional accumulation above $670'}
          </div>
        ) : (
          <div
            style={{
              padding: '10px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.01)',
              border: '1px solid rgba(255,255,255,0.03)',
            }}
          >
            <div
              style={{
                width: '70%',
                height: '8px',
                borderRadius: '4px',
                background: 'rgba(255,255,255,0.04)',
              }}
            />
          </div>
        )}
      </div>

      {/* Verdict */}
      <div
        style={{
          opacity: showVerdict ? 1 : 0.15,
          transition: 'opacity 0.8s ease',
        }}
      >
        <div
          style={{
            fontSize: '9px',
            color: '#00e5ff',
            letterSpacing: '1.5px',
            fontWeight: 700,
            marginBottom: '8px',
            fontFamily: "'Oxanium', monospace",
          }}
        >
          VERDICT
        </div>
        {showVerdict && verdict ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px',
              borderRadius: '8px',
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              animation: 'verdictPulse 1s ease',
            }}
          >
            <span
              style={{
                background: colors.badge,
                color: '#0a0f1a',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '1px',
                fontFamily: "'Oxanium', monospace",
              }}
            >
              {verdict.type}
            </span>
            <span style={{ fontSize: '11px', color: '#e0e6f0' }}>
              {verdict.reasoning || 'Analysis complete'}
            </span>
          </div>
        ) : (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.01)',
              border: '1px solid rgba(255,255,255,0.03)',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '16px', color: '#1a2a3a' }}>?</span>
            <span style={{ fontSize: '10px', color: '#2a4a5a', marginLeft: '8px' }}>Calculating...</span>
          </div>
        )}
      </div>
    </div>
  );
}
