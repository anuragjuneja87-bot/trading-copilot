'use client';

import { useWebSocketSafe } from '@/lib/websocket';
import { getDataConfig, getDataMode } from '@/stores';
import { Wifi, WifiOff, Clock, Zap, AlertCircle, Loader2 } from 'lucide-react';

export function DataModeBadge() {
  const ws = useWebSocketSafe();
  const config = getDataConfig();
  const mode = getDataMode();
  
  const isLive = ws?.isConnected && ws?.isAuthenticated;
  const isConnecting = ws?.isConnected && !ws?.isAuthenticated;
  const hasError = ws?.error;

  return (
    <div 
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
      style={{ 
        background: isLive 
          ? `${config.badgeColor}20`
          : hasError 
          ? 'rgba(255,82,82,0.15)'
          : 'rgba(255,255,255,0.05)',
        border: `1px solid ${isLive ? config.badgeColor : hasError ? '#ff5252' : 'rgba(255,255,255,0.1)'}`,
      }}
      title={hasError || config.description}
    >
      {/* Connection Status Icon */}
      {isLive ? (
        mode === 'realtime' ? (
          <Zap className="w-3 h-3" style={{ color: config.badgeColor }} />
        ) : (
          <Clock className="w-3 h-3" style={{ color: config.badgeColor }} />
        )
      ) : hasError ? (
        <AlertCircle className="w-3 h-3" style={{ color: '#ff5252' }} />
      ) : isConnecting ? (
        <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#ffc107' }} />
      ) : (
        <WifiOff className="w-3 h-3" style={{ color: '#666' }} />
      )}
      
      {/* Status Text */}
      <span style={{ 
        color: isLive ? config.badgeColor : hasError ? '#ff5252' : '#666' 
      }}>
        {isLive ? config.label : hasError ? 'Error' : isConnecting ? 'Connecting...' : 'Offline'}
      </span>
    </div>
  );
}

// Compact version for navbar
export function DataModeBadgeCompact() {
  const ws = useWebSocketSafe();
  const config = getDataConfig();
  const mode = getDataMode();
  
  const isLive = ws?.isConnected && ws?.isAuthenticated;
  
  if (!isLive) return null;

  return (
    <div 
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
      style={{ 
        background: `${config.badgeColor}15`,
        color: config.badgeColor,
      }}
    >
      {mode === 'realtime' ? (
        <Zap className="w-2.5 h-2.5" />
      ) : (
        <Clock className="w-2.5 h-2.5" />
      )}
      {mode === 'realtime' ? 'LIVE' : 'DELAYED'}
    </div>
  );
}
