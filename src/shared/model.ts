import { cleanTheme, validTheme, type AppearanceOptions, type WorkspaceTheme } from './theme';

export const COLORS = ['slate', 'blue', 'green', 'amber', 'rose', 'violet'] as const;
export type Color = typeof COLORS[number];
export type Status = 'loading' | 'ready' | 'sign-in' | 'offline' | 'error';

export interface Account { id: string; name: string; color: Color; zoom?: number; theme?: WorkspaceTheme }
export const CALL_PHASES = ['idle', 'ringing', 'dialing', 'connecting', 'active', 'held', 'reconnecting', 'transferring', 'ending'] as const;
export type CallPhase = typeof CALL_PHASES[number];
export type ThemeSupport = 'unmodified' | 'waiting' | 'compatible' | 'unsupported';
export interface Preferences {
  notifications: boolean;
  privateNotifications: boolean;
  experimentalAnswer: boolean;
  launchAtLogin: boolean;
  showMenuBar: boolean;
  menuBarCount: boolean;
  menuBarLayout: 'separate' | 'combined';
  animateActivity: boolean;
}
export interface Config {
  version: 1;
  sidebarCollapsed: boolean;
  macAppearance: boolean;
  accounts: Account[];
  activeId: string | null;
  preferences: Preferences;
}
export interface AccountState extends Account {
  status: Status;
  unread: number;
  unreadKnown: boolean;
  ringing: boolean;
  inCall: boolean;
  callPhase: CallPhase;
  muted: boolean;
  themeSupport: ThemeSupport;
  themeAccent?: string;
}
export interface Snapshot {
  nativeShell?: boolean;
  sidebarCollapsed?: boolean;
  macAppearance?: boolean;
  accounts: AccountState[];
  activeId: string | null;
  preferences: Preferences;
  notificationError: boolean;
  version: string;
  appearance?: AppearanceOptions;
  themeCatalog?: { id: string; name: string; colors: AppearanceOptions['resolved']['colors'] }[];
}
export type ShellCommand =
  | { type: 'add'; name: string; color: Color }
  | { type: 'select' | 'reload' | 'remove' | 'test-notification' | 'move-up' | 'move-down'; id: string }
  | { type: 'rename'; id: string; name: string; color: Color }
  | { type: 'preferences'; preferences: Preferences }
  | { type: 'overlay'; open: boolean }
  | { type: 'workspace-theme'; id: string }
  | { type: 'preview-theme' | 'save-theme'; id: string; theme: WorkspaceTheme }
  | { type: 'cancel-theme'; id: string }
  | { type: 'appearance-changed' }
  | { type: 'open-help' | 'new-workspace' | 'settings' | 'health' | 'workspace-limit' | 'toggle-sidebar' | 'toggle-appearance' | 'zoom-in' | 'zoom-out' | 'reset-zoom' };
export type AccountEvent =
  | { type: 'heartbeat' }
  | { type: 'notification'; id: string; title: string; body: string; tag: string; silent: boolean }
  | { type: 'notification-close'; id: string }
  | { type: 'state'; status: 'ready' | 'sign-in' | 'offline'; unread: number; unreadKnown: boolean; inCall: boolean; callPhase: CallPhase; muted: boolean; themeSupport: ThemeSupport }
  | { type: 'ring'; id: string }
  | { type: 'ring-end'; id: string }
  | { type: 'answer-result'; id: string; clicked: boolean };

export const DEFAULT_PREFERENCES: Preferences = {
  notifications: true,
  privateNotifications: false,
  experimentalAnswer: false,
  launchAtLogin: false,
  showMenuBar: true,
  menuBarCount: true,
  menuBarLayout: 'separate',
  animateActivity: true
};
export const emptyConfig = (): Config => ({ version: 1, sidebarCollapsed: false, macAppearance: true, accounts: [], activeId: null, preferences: { ...DEFAULT_PREFERENCES } });

export const ZOOM_FACTORS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export function validZoom(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 3; }

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
  const preferences = value as Record<string, unknown>;
  return Object.keys(DEFAULT_PREFERENCES).filter(key => key !== 'menuBarLayout').every(key => typeof preferences[key] === 'boolean')
    && (preferences.menuBarLayout === 'separate' || preferences.menuBarLayout === 'combined');
}
export function parseConfig(value: unknown): Config {
  if (!value || typeof value !== 'object') throw new Error('Invalid settings file');
  const v = value as Config;
  const preferences = { ...v.preferences,
    showMenuBar: v.preferences?.showMenuBar === undefined ? true : v.preferences.showMenuBar,
    menuBarCount: v.preferences?.menuBarCount === undefined ? true : v.preferences.menuBarCount,
    menuBarLayout: v.preferences?.menuBarLayout === undefined ? 'separate' : v.preferences.menuBarLayout,
    animateActivity: v.preferences?.animateActivity === undefined ? true : v.preferences.animateActivity
  };
  if (v.version !== 1 || !Array.isArray(v.accounts) || v.accounts.length > 12 || !validPreferences(preferences)
    || (v.macAppearance !== undefined && typeof v.macAppearance !== 'boolean')) throw new Error('Unsupported settings file');
  const seen = new Set<string>();
  for (const a of v.accounts) {
    if (!a || !validId(a.id) || seen.has(a.id) || !validName(a.name) || !validColor(a.color) || (a.zoom !== undefined && !validZoom(a.zoom)) || (a.theme !== undefined && !validTheme(a.theme))) throw new Error('Invalid workspace settings');
    seen.add(a.id);
  }
  return {
    version: 1,
    sidebarCollapsed: v.sidebarCollapsed === true,
    macAppearance: v.macAppearance !== false,
    accounts: v.accounts.map(a => ({ id: a.id, name: a.name.trim(), color: a.color, ...(a.zoom !== undefined ? { zoom: a.zoom } : {}), ...(a.theme ? { theme: cleanTheme(a.theme) } : {}) })),
    activeId: seen.has(v.activeId ?? '') ? v.activeId : v.accounts[0]?.id ?? null,
    preferences: Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map(k => [k, preferences[k as keyof Preferences]])) as unknown as Preferences
  };
}

export function partitionFor(id: string): string {
  if (!validId(id)) throw new Error('Invalid workspace ID');
  return `persist:workspace-${id}`;
}
