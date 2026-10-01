export const COLORS = ['slate', 'blue', 'green', 'amber', 'rose', 'violet'] as const;
export type Color = typeof COLORS[number];
export type Status = 'loading' | 'ready' | 'sign-in' | 'offline' | 'error';

export interface Account { id: string; name: string; color: Color }
export interface Preferences {
  notifications: boolean;
  privateNotifications: boolean;
  experimentalAnswer: boolean;
  launchAtLogin: boolean;
}
export interface Config {
  version: 1;
  accounts: Account[];
  activeId: string | null;
  preferences: Preferences;
}
export interface AccountState extends Account {
  status: Status;
  unread: number;
  ringing: boolean;
  inCall: boolean;
}
export interface Snapshot {
  accounts: AccountState[];
  activeId: string | null;
  preferences: Preferences;
  notificationError: boolean;
  version: string;
}
export type ShellCommand =
  | { type: 'add'; name: string; color: Color }
  | { type: 'select' | 'reload' | 'remove' | 'test-notification'; id: string }
  | { type: 'rename'; id: string; name: string; color: Color }
  | { type: 'preferences'; preferences: Preferences }
  | { type: 'overlay'; open: boolean }
  | { type: 'open-help' };
export type AccountEvent =
  | { type: 'notification'; id: string; title: string; body: string; tag: string; silent: boolean }
  | { type: 'notification-close'; id: string }
  | { type: 'state'; status: 'ready' | 'sign-in' | 'offline'; unread: number; inCall: boolean }
  | { type: 'ring'; id: string }
  | { type: 'ring-end'; id: string }
  | { type: 'answer-result'; id: string; clicked: boolean };

export const DEFAULT_PREFERENCES: Preferences = {
  notifications: true,
  privateNotifications: false,
  experimentalAnswer: false,
  launchAtLogin: false
};
export const emptyConfig = (): Config => ({ version: 1, accounts: [], activeId: null, preferences: { ...DEFAULT_PREFERENCES } });

export function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 48 && !/[\u0000-\u001f\u007f]/.test(value);
}
export function validColor(value: unknown): value is Color {
  return COLORS.includes(value as Color);
}
export function validPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== 'object') return false;
  return Object.keys(DEFAULT_PREFERENCES).every(key => typeof (value as Record<string, unknown>)[key] === 'boolean');
}
export function parseConfig(value: unknown): Config {
  if (!value || typeof value !== 'object') throw new Error('Invalid settings file');
  const v = value as Config;
  if (v.version !== 1 || !Array.isArray(v.accounts) || v.accounts.length > 12 || !validPreferences(v.preferences)) throw new Error('Unsupported settings file');
  const seen = new Set<string>();
  for (const a of v.accounts) {
    if (!a || !validId(a.id) || seen.has(a.id) || !validName(a.name) || !validColor(a.color)) throw new Error('Invalid workspace settings');
    seen.add(a.id);
  }
  return {
    version: 1,
    accounts: v.accounts.map(a => ({ id: a.id, name: a.name.trim(), color: a.color })),
    activeId: seen.has(v.activeId ?? '') ? v.activeId : v.accounts[0]?.id ?? null,
    preferences: Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map(k => [k, v.preferences[k as keyof Preferences]])) as unknown as Preferences
  };
}

export function partitionFor(id: string): string {
  if (!validId(id)) throw new Error('Invalid workspace ID');
  return `persist:workspace-${id}`;
}
