/**
 * Extracts the canonical origin from a URL or an origin pattern (full URL, bare origin or wildcard).
 * @example
 * normalizeOrigin('http://localhost:3010/game'); // 'http://localhost:3010'
 * normalizeOrigin('https://*.hydraone.app/'); // 'https://*.hydraone.app'
 */
export function normalizeOrigin(item: string): string {
  const trimmed = item.trim();
  if (!trimmed) return '';

  if (trimmed.includes('*')) {
    const pattern = trimmed.replace(/\/+$/, '');
    return pattern === '*' || /^[a-z][a-z0-9+.-]*:\/\//i.test(pattern)
      ? pattern
      : `https://${pattern}`;
  }

  try {
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')
        ? `http://${trimmed}`
        : `https://${trimmed}`;
    return new URL(withProto).origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

/**
 * Tells whether `origin` matches an allow-list entry: an exact origin, an app URL, or a wildcard
 * pattern such as `https://*.hydraone.app`.
 */
export function matchOriginPattern(patternOrUrl: string, origin: string): boolean {
  const trimmed = patternOrUrl.trim();
  if (!trimmed || !origin) return false;

  const targetOrigin = normalizeOrigin(origin);
  const allowedOrigin = normalizeOrigin(trimmed);

  if (!allowedOrigin || !targetOrigin) return false;
  if (allowedOrigin === '*' || allowedOrigin === targetOrigin) return true;

  if (allowedOrigin.includes('*')) {
    const escaped = allowedOrigin.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(targetOrigin);
  }

  return false;
}

/** Splits a comma-separated origin list (for example an env variable) into trimmed, non-empty entries. */
export function parseOriginList(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}
