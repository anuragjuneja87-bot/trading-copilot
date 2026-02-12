/**
 * Client-side caching utility with TTL support
 * Uses sessionStorage for persistence across navigation
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const CACHE_PREFIX = 'trading_copilot_cache_';

/**
 * Get cache key for a specific data type
 */
function getCacheKey(type: string, ...params: (string | number)[]): string {
  const key = params.length > 0 ? `${type}_${params.join('_')}` : type;
  return `${CACHE_PREFIX}${key}`;
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid<T>(entry: CacheEntry<T> | null): boolean {
  if (!entry) return false;
  const now = Date.now();
  return (now - entry.timestamp) < entry.ttl;
}

/**
 * Get cached data if valid
 */
export function getCachedData<T>(type: string, ...params: (string | number)[]): T | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const key = getCacheKey(type, ...params);
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    
    const entry: CacheEntry<T> = JSON.parse(cached);
    if (isCacheValid(entry)) {
      return entry.data;
    } else {
      // Remove stale cache
      sessionStorage.removeItem(key);
      return null;
    }
  } catch (error) {
    console.error('[Cache] Error reading cache:', error);
    return null;
  }
}

/**
 * Set cached data with TTL
 */
export function setCachedData<T>(
  type: string,
  data: T,
  ttl: number,
  ...params: (string | number)[]
): void {
  if (typeof window === 'undefined') return;
  
  try {
    const key = getCacheKey(type, ...params);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error('[Cache] Error writing cache:', error);
    // If quota exceeded, clear old entries
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      clearOldCache();
      try {
        const key = getCacheKey(type, ...params);
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          ttl,
        };
        sessionStorage.setItem(key, JSON.stringify(entry));
      } catch (retryError) {
        console.error('[Cache] Failed to write after clearing old cache:', retryError);
      }
    }
  }
}

/**
 * Clear old cache entries (keep last 50 entries)
 */
function clearOldCache(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const entries: Array<{ key: string; timestamp: number }> = [];
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        try {
          const cached = sessionStorage.getItem(key);
          if (cached) {
            const entry = JSON.parse(cached);
            entries.push({ key, timestamp: entry.timestamp });
          }
        } catch {
          // Invalid entry, remove it
          sessionStorage.removeItem(key);
        }
      }
    }
    
    // Sort by timestamp (oldest first) and remove oldest entries
    entries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = entries.slice(0, Math.max(0, entries.length - 50));
    toRemove.forEach(({ key }) => sessionStorage.removeItem(key));
  } catch (error) {
    console.error('[Cache] Error clearing old cache:', error);
  }
}

/**
 * Clear specific cache entry
 */
export function clearCache(type: string, ...params: (string | number)[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const key = getCacheKey(type, ...params);
    sessionStorage.removeItem(key);
  } catch (error) {
    console.error('[Cache] Error clearing cache:', error);
  }
}

/**
 * Get cache age in milliseconds
 */
export function getCacheAge(type: string, ...params: (string | number)[]): number | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const key = getCacheKey(type, ...params);
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    
    const entry: CacheEntry<any> = JSON.parse(cached);
    return Date.now() - entry.timestamp;
  } catch {
    return null;
  }
}

/**
 * Check if cache exists (even if stale)
 */
export function hasCache(type: string, ...params: (string | number)[]): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const key = getCacheKey(type, ...params);
    return sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/**
 * Cache duration constants (in milliseconds)
 */
export const CACHE_DURATIONS = {
  morning_briefing: 24 * 60 * 60 * 1000, // 24 hours (daily report)
  key_levels: 15 * 60 * 1000,             // 15 minutes
  quick_thesis: 60 * 60 * 1000,           // 1 hour per ticker
  watchlist_prices: 30 * 1000,             // 30 seconds
} as const;

/**
 * Get today's date string in ET timezone (for daily cache keys)
 */
export function getTodayET(): string {
  // Get current time in ET
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return etTime.toISOString().split('T')[0]; // YYYY-MM-DD
}
