// Format currency with proper negative handling
export function formatCurrency(value: number, options?: { 
  compact?: boolean; 
  showSign?: boolean;
  decimals?: number;
}): string {
  const { compact = false, showSign = false, decimals = 0 } = options || {};
  
  const absValue = Math.abs(value);
  const isNegative = value < 0;
  
  let formatted: string;
  
  if (compact) {
    if (absValue >= 1e9) {
      formatted = `$${(absValue / 1e9).toFixed(1)}B`;
    } else if (absValue >= 1e6) {
      formatted = `$${(absValue / 1e6).toFixed(1)}M`;
    } else if (absValue >= 1e3) {
      formatted = `$${(absValue / 1e3).toFixed(1)}K`;
    } else {
      formatted = `$${absValue.toFixed(decimals)}`;
    }
  } else {
    formatted = `$${absValue.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }
  
  // Apply sign
  if (isNegative) {
    return `-${formatted}`; // -$401 not $-401
  } else if (showSign && value > 0) {
    return `+${formatted}`;
  }
  
  return formatted;
}
