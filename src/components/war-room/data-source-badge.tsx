'use client';

interface DataSourceBadgeProps {
  isMarketClosed?: boolean;
  tradingDay?: string;
  lastUpdate?: Date | null;
}

export function DataSourceBadge({ isMarketClosed, tradingDay, lastUpdate }: DataSourceBadgeProps) {
  if (isMarketClosed && tradingDay) {
    return (
      <span className="text-[10px] text-yellow-500 px-2 py-0.5 rounded bg-yellow-500/10">
        ⚠️ Market closed - {tradingDay}
      </span>
    );
  }
  
  if (lastUpdate) {
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    return (
      <span className="text-[10px] text-gray-500">
        {seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`}
      </span>
    );
  }
  
  return null;
}
