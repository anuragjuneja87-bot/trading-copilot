// Professional dark trading theme for ECharts
// Designed to match the war room aesthetic: bg #060810, cyan/green/red accents

export const TRADING_THEME = {
  // Core colors
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: "'Oxanium', 'SF Mono', monospace",
    color: '#8b99b0',
    fontSize: 10,
  },
  title: {
    textStyle: {
      color: '#e0e6f0',
      fontFamily: "'Oxanium', monospace",
      fontWeight: 700,
      fontSize: 11,
    },
    subtextStyle: {
      color: '#4a6070',
      fontFamily: "'Oxanium', monospace",
      fontSize: 9,
    },
  },
  // Axis styling
  categoryAxis: {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    axisTick: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    axisLabel: { color: '#4a6070', fontSize: 9, fontFamily: "'Oxanium', monospace" },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    axisTick: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    axisLabel: { color: '#4a6070', fontSize: 9, fontFamily: "'Oxanium', monospace" },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
  },
  // Tooltip
  tooltip: {
    backgroundColor: 'rgba(10,15,26,0.95)',
    borderColor: 'rgba(0,229,255,0.2)',
    borderWidth: 1,
    textStyle: {
      color: '#e0e6f0',
      fontFamily: "'Oxanium', monospace",
      fontSize: 11,
    },
    extraCssText: 'box-shadow: 0 4px 20px rgba(0,0,0,0.5); backdrop-filter: blur(10px);',
  },
  // Legend
  legend: {
    textStyle: { color: '#8b99b0', fontSize: 9, fontFamily: "'Oxanium', monospace" },
  },
  // Color palette
  color: ['#00e5ff', '#00e676', '#ff5252', '#ffc107', '#7c4dff', '#ff6e40', '#64ffda'],
};

// Common chart option defaults
export const CHART_DEFAULTS = {
  grid: {
    top: 30,
    right: 12,
    bottom: 24,
    left: 50,
    containLabel: false,
  },
  animation: true,
  animationDuration: 600,
  animationEasing: 'cubicOut' as const,
};

// Color constants
export const COLORS = {
  cyan: '#00e5ff',
  green: '#00e676',
  red: '#ff5252',
  yellow: '#ffc107',
  purple: '#7c4dff',
  muted: '#8b99b0',
  dimmed: '#4a6070',
  darkest: '#2a4a5a',
  bg: '#060810',
  cardBg: 'rgba(255,255,255,0.02)',
  cardBorder: 'rgba(255,255,255,0.05)',
  glowCyan: 'rgba(0,229,255,0.15)',
  glowGreen: 'rgba(0,230,118,0.15)',
  glowRed: 'rgba(255,82,82,0.15)',
};
