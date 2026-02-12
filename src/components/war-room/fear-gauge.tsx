'use client';

interface FearGaugeProps {
  value: number; // 0-100
  label?: string;
}

export function FearGauge({ value, label }: FearGaugeProps) {
  const angle = -90 + (value / 100) * 180;
  const color = value < 30 ? '#ff5252' : value < 60 ? '#ffc107' : '#00e676';
  const displayLabel = label || (value < 30 ? 'FEAR' : value < 60 ? 'NEUTRAL' : 'GREED');
  
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="100" height="58" viewBox="0 0 100 58" style={{ display: 'block', margin: '0 auto' }}>
        {/* Background arc */}
        <path
          d="M10,55 A40,40 0 0,1 90,55"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Gradient arc */}
        <path
          d="M10,55 A40,40 0 0,1 90,55"
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="126"
          strokeDashoffset={126 - (value / 100) * 126}
        />
        {/* Needle */}
        <line
          x1="50"
          y1="55"
          x2={50 + 30 * Math.cos((angle * Math.PI) / 180)}
          y2={55 + 30 * Math.sin((angle * Math.PI) / 180)}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx="50" cy="55" r="3" fill={color} />
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff5252" />
            <stop offset="50%" stopColor="#ffc107" />
            <stop offset="100%" stopColor="#00e676" />
          </linearGradient>
        </defs>
      </svg>
      <div
        style={{
          fontSize: '20px',
          fontWeight: 800,
          color,
          marginTop: '-2px',
          fontFamily: "'Oxanium', monospace",
        }}
      >
        {Math.round(value)}
      </div>
      <div
        style={{
          fontSize: '9px',
          color: '#4a6070',
          letterSpacing: '1.5px',
          fontWeight: 700,
          fontFamily: "'Oxanium', monospace",
        }}
      >
        {displayLabel}
      </div>
    </div>
  );
}
