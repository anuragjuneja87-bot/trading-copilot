'use client';

import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, COLORS } from '@/lib/echarts-theme';

interface DPSizeDistProps {
  distribution: { mega: number; large: number; medium: number; small: number };
}

export function DPSizeDistribution({ distribution }: DPSizeDistProps) {
  const option = {
    tooltip: { ...TRADING_THEME.tooltip },
    series: [{
      type: 'pie',
      radius: ['50%', '78%'],
      center: ['50%', '50%'],
      data: [
        { value: distribution.mega, name: 'Mega ($10M+)', itemStyle: { color: COLORS.cyan } },
        { value: distribution.large, name: 'Large ($5M+)', itemStyle: { color: COLORS.green } },
        { value: distribution.medium, name: 'Medium ($1M+)', itemStyle: { color: COLORS.yellow } },
        { value: distribution.small, name: 'Small (<$1M)', itemStyle: { color: 'rgba(139,153,176,0.4)' } },
      ].filter(d => d.value > 0),
      label: { show: false },
      emphasis: {
        label: { show: true, fontWeight: 'bold', color: '#e0e6f0', fontSize: 11, fontFamily: "'Oxanium', monospace" },
      },
      itemStyle: { borderColor: '#060810', borderWidth: 2 },
    }],
  };

  return (
    <div className="flex flex-col items-center">
      <ReactECharts option={option} style={{ height: '120px', width: '120px' }} notMerge={true} />
      {/* Legend below */}
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {[
          { label: 'Mega', color: COLORS.cyan, count: distribution.mega },
          { label: 'Large', color: COLORS.green, count: distribution.large },
          { label: 'Medium', color: COLORS.yellow, count: distribution.medium },
          { label: 'Small', color: 'rgba(139,153,176,0.6)', count: distribution.small },
        ].filter(d => d.count > 0).map(d => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
            <span className="text-[10px] text-[#8b99b0]" style={{ fontFamily: "'Oxanium', monospace" }}>
              {d.label}: {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
