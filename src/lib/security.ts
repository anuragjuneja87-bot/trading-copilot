/**
 * src/lib/security.ts — Shared input validation & error sanitization
 */

const TICKER_REGEX = /^[A-Z]{1,5}$/;
const TICKER_EXTENDED_REGEX = /^[A-Z]{1,5}[./-]?[A-Z]?$/;

export function validateTicker(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase();
  if (cleaned.length === 0 || cleaned.length > 6) return null;
  if (!TICKER_EXTENDED_REGEX.test(cleaned)) return null;
  return cleaned;
}

export function validateTickers(
  raw: string | null | undefined,
  maxCount: number = 20
): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map(t => validateTicker(t))
    .filter((t): t is string => t !== null)
    .slice(0, maxCount);
}

export function validateInt(
  raw: string | null | undefined,
  defaultVal: number,
  min: number,
  max: number
): number {
  if (!raw) return defaultVal;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return defaultVal;
  return Math.max(min, Math.min(max, parsed));
}

export function validateText(
  raw: string | null | undefined,
  maxLength: number = 2000
): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > maxLength) return cleaned.substring(0, maxLength);
  return cleaned;
}

export function safeError(
  error: unknown,
  context: string,
  fallbackMessage: string = 'An error occurred'
): { message: string; status: number } {
  console.error(`[${context}]`, error);
  let status = 500;
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return { message: 'Request timed out', status: 504 };
    }
    if (error.message.includes('not configured') || error.message.includes('not set')) {
      return { message: 'Service temporarily unavailable', status: 503 };
    }
  }
  return { message: fallbackMessage, status };
}

export function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/apiKey=[^&\s]+/gi, 'apiKey=***')
    .replace(/Bearer [^\s]+/gi, 'Bearer ***')
    .replace(/\/home\/[^\s]+/g, '[internal]')
    .replace(/\/tmp\/[^\s]+/g, '[internal]')
    .replace(/\/var\/[^\s]+/g, '[internal]')
    .replace(/postgresql:\/\/[^\s]+/g, '[redacted]')
    .replace(/https?:\/\/[^\s]*apiKey[^\s]*/g, '[api-call]')
    .substring(0, 200);
}

export function isPayloadTooLarge(
  contentLength: string | null,
  maxBytes: number = 100_000
): boolean {
  if (!contentLength) return false;
  const size = parseInt(contentLength, 10);
  return !isNaN(size) && size > maxBytes;
}

export function validateDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null;
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  return cleaned;
}
