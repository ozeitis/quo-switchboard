const APP_ORIGINS = new Set(['https://my.quo.com', 'https://my.openphone.com']);
const AUTH_ORIGINS = new Set(['https://auth.quo.com', 'https://auth.openphone.com']);

export function appOrigin(raw: string): boolean {
  try { return APP_ORIGINS.has(new URL(raw).origin); } catch { return false; }
}
export function accountNavigation(raw: string): boolean {
  try {
    const u = new URL(raw);
    return !u.username && !u.password && (APP_ORIGINS.has(u.origin) || AUTH_ORIGINS.has(u.origin));
  } catch { return false; }
}
export function externalURL(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && !!u.hostname;
  } catch { return false; }
}

export function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, max).trim() : '';
}

export class RateLimit {
  private windows = new Map<number, { count: number; start: number }>();
  constructor(private limit: number, private interval: number) {}
  accept(sender: number, now = Date.now()): boolean {
    const current = this.windows.get(sender);
    if (!current || now - current.start >= this.interval) {
      this.windows.set(sender, { count: 1, start: now });
      return true;
    }
    current.count += 1;
    return current.count <= this.limit;
  }
  remove(sender: number): void { this.windows.delete(sender); }
}
