'use client';

export function YodhaLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 48 48" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Shield */}
      <path d="M24 3L6 12v14c0 11.4 7.7 18.5 18 21 10.3-2.5 18-9.6 18-21V12L24 3z" fill="url(#ysg)" opacity="0.15"/>
      <path d="M24 3L6 12v14c0 11.4 7.7 18.5 18 21 10.3-2.5 18-9.6 18-21V12L24 3z" stroke="url(#ybg)" strokeWidth="1.5" fill="none"/>
      {/* Trishul center */}
      <line x1="24" y1="12" x2="24" y2="35" stroke="#00e5ff" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M24 10l-2 4h4l-2-4z" fill="#00e5ff"/>
      {/* Trishul prongs */}
      <path d="M24 18l-7-6" stroke="#00e5ff" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="16.5" cy="11.5" r="1.5" fill="#00e5ff"/>
      <path d="M24 18l7-6" stroke="#00e5ff" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="31.5" cy="11.5" r="1.5" fill="#00e5ff"/>
      {/* Crossbar */}
      <line x1="18" y1="22" x2="30" y2="22" stroke="#00e5ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      {/* Chart bars */}
      <rect x="17" y="31" width="3" height="4" rx="0.5" fill="#00e676" opacity="0.8"/>
      <rect x="22.5" y="28" width="3" height="7" rx="0.5" fill="#00e676"/>
      <rect x="28" y="30" width="3" height="5" rx="0.5" fill="#00e676" opacity="0.8"/>
      <defs>
        <linearGradient id="ysg" x1="24" y1="3" x2="24" y2="47">
          <stop offset="0%" stopColor="#00e5ff"/><stop offset="100%" stopColor="#7c4dff"/>
        </linearGradient>
        <linearGradient id="ybg" x1="6" y1="3" x2="42" y2="47">
          <stop offset="0%" stopColor="#00e5ff"/><stop offset="50%" stopColor="#00e5ff" stopOpacity="0.4"/><stop offset="100%" stopColor="#7c4dff"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export function YodhaWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-bold ${className}`} style={{ fontFamily: "'Oxanium', 'JetBrains Mono', monospace" }}>
      <span className="text-white">Trade</span>
      <span style={{ color: '#00e5ff' }}>Yodha</span>
    </span>
  );
}
