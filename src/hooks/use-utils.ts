import { useState, useEffect, useCallback, useRef } from 'react';
import { getMarketSession, type MarketSession } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════
//  MARKET SESSION HOOK
// ═══════════════════════════════════════════════════════════════

export function useMarketSession() {
  const [session, setSession] = useState<MarketSession>('closed');

  useEffect(() => {
    const update = () => setSession(getMarketSession());
    update();
    
    // Update every minute
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  return session;
}

// ═══════════════════════════════════════════════════════════════
//  CLOCK HOOK
// ═══════════════════════════════════════════════════════════════

export function useClock(timezone = 'America/New_York') {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatted = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(time);

  return { time, formatted };
}

// ═══════════════════════════════════════════════════════════════
//  DEBOUNCED VALUE HOOK
// ═══════════════════════════════════════════════════════════════

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ═══════════════════════════════════════════════════════════════
//  PREVIOUS VALUE HOOK
// ═══════════════════════════════════════════════════════════════

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

// ═══════════════════════════════════════════════════════════════
//  LOCAL STORAGE HOOK
// ═══════════════════════════════════════════════════════════════

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error('Error saving to localStorage:', error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

// ═══════════════════════════════════════════════════════════════
//  MEDIA QUERY HOOK
// ═══════════════════════════════════════════════════════════════

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}

export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
}

export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1025px)');
}

// ═══════════════════════════════════════════════════════════════
//  INTERSECTION OBSERVER HOOK
// ═══════════════════════════════════════════════════════════════

export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  options?: IntersectionObserverInit
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, options]);

  return isIntersecting;
}

// ═══════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUT HOOK
// ═══════════════════════════════════════════════════════════════

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const matchesKey = e.key.toLowerCase() === key.toLowerCase();
      const matchesCtrl = modifiers?.ctrl ? e.ctrlKey : !e.ctrlKey;
      const matchesShift = modifiers?.shift ? e.shiftKey : !e.shiftKey;
      const matchesAlt = modifiers?.alt ? e.altKey : !e.altKey;
      const matchesMeta = modifiers?.meta ? e.metaKey : !e.metaKey;

      if (matchesKey && matchesCtrl && matchesShift && matchesAlt && matchesMeta) {
        e.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback, modifiers]);
}

// ═══════════════════════════════════════════════════════════════
//  CLICK OUTSIDE HOOK
// ═══════════════════════════════════════════════════════════════

export function useClickOutside(
  ref: React.RefObject<Element>,
  callback: () => void
) {
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [ref, callback]);
}

// ═══════════════════════════════════════════════════════════════
//  COPY TO CLIPBOARD HOOK
// ═══════════════════════════════════════════════════════════════

export function useCopyToClipboard(): [
  boolean,
  (text: string) => Promise<boolean>
] {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      setCopied(false);
      return false;
    }
  };

  return [copied, copy];
}
