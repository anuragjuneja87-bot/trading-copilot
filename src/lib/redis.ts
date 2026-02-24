/**
 * Shared Upstash Redis REST client
 * Used by timeline API, cron worker, and thesis storage
 */

const REDIS_URL = () => process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN;

export function hasRedis(): boolean {
  return !!(REDIS_URL() && REDIS_TOKEN());
}

export async function redisGet<T = any>(key: string): Promise<T | null> {
  const url = REDIS_URL();
  const token = REDIS_TOKEN();
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (data.result) {
      return JSON.parse(data.result) as T;
    }
    return null;
  } catch (e) {
    console.error(`[Redis] GET ${key} error:`, e);
    return null;
  }
}

export async function redisSet(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
  const url = REDIS_URL();
  const token = REDIS_TOKEN();
  if (!url || !token) return false;

  try {
    const path = ttlSeconds
      ? `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}/EX/${ttlSeconds}`
      : `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}`;
    
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    });
    const data = await res.json();
    return data.result === 'OK';
  } catch (e) {
    console.error(`[Redis] SET ${key} error:`, e);
    return false;
  }
}

export async function redisLpush(key: string, value: any): Promise<boolean> {
  const url = REDIS_URL();
  const token = REDIS_TOKEN();
  if (!url || !token) return false;

  try {
    const res = await fetch(`${url}/lpush/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}`, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    });
    const data = await res.json();
    return typeof data.result === 'number';
  } catch (e) {
    console.error(`[Redis] LPUSH ${key} error:`, e);
    return false;
  }
}

export async function redisLrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
  const url = REDIS_URL();
  const token = REDIS_TOKEN();
  if (!url || !token) return [];

  try {
    const res = await fetch(`${url}/lrange/${encodeURIComponent(key)}/${start}/${stop}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (Array.isArray(data.result)) {
      return data.result.map((item: string) => {
        try { return JSON.parse(item) as T; }
        catch { return item as unknown as T; }
      });
    }
    return [];
  } catch (e) {
    console.error(`[Redis] LRANGE ${key} error:`, e);
    return [];
  }
}

export async function redisExpire(key: string, ttlSeconds: number): Promise<boolean> {
  const url = REDIS_URL();
  const token = REDIS_TOKEN();
  if (!url || !token) return false;

  try {
    const res = await fetch(`${url}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    });
    const data = await res.json();
    return data.result === 1;
  } catch (e) {
    console.error(`[Redis] EXPIRE ${key} error:`, e);
    return false;
  }
}

// ── Key helpers ──────────────────────────────────────────

export function getTodayET(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

export function timelineKey(ticker: string, date?: string): string {
  return `tl:${ticker.toUpperCase()}:${date || getTodayET()}`;
}

export function thesisKey(ticker: string, date?: string): string {
  return `thesis:${ticker.toUpperCase()}:${date || getTodayET()}`;
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  const timeInMinutes = hour * 60 + minute;
  const isWeekend = day === 0 || day === 6;
  return !isWeekend && timeInMinutes >= 570 && timeInMinutes < 960; // 9:30-16:00
}
