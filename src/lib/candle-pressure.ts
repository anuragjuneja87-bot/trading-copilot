interface PressureInput { bar: any; i: number; bars: any[]; vwap: number; }

export function computeBarPressure(input: PressureInput): { bp: number; brp: number } {
  const { bar, i, bars, vwap } = input;
  let bp = 50, brp = 50;
  if (bar.c > vwap) { bp += 10; brp -= 10; } else { bp -= 10; brp += 10; }
  if (bar.c > bar.o) { bp += 8; brp -= 5; } else { bp -= 5; brp += 8; }
  if (i > 5) {
    const avgVol = bars.slice(Math.max(0, i - 5), i).reduce((s: number, b: any) => s + b.v, 0) / 5;
    if (bar.v > avgVol * 1.5) { if (bar.c > bar.o) { bp += 12; } else { brp += 12; } }
  }
  if (i >= 3) {
    const trend = bars[i].c - bars[i - 3].o;
    if (trend > 0) { bp += Math.min(15, trend * 10); } else { brp += Math.min(15, Math.abs(trend) * 10); }
  }
  return { bp: Math.max(0, Math.min(100, bp)), brp: Math.max(0, Math.min(100, brp)) };
}

export function pressureToColor(bp: number, brp: number): string {
  const spread = bp - brp;
  if (spread > 25) return '#26a69a';
  if (spread > 8)  return '#1b8a7a';
  if (spread > -8) return '#ff9800';
  if (spread > -25) return '#c94442';
  return '#ef5350';
}
