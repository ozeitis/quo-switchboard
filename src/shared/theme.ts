import Color from 'colorjs.io';

export const THEME_PRESETS = [
  { id: 'quo', name: 'Quo', accent: '#1a6eff' },
  { id: 'mac', name: 'Mac', accent: '#007aff' },
  { id: 'ocean', name: 'Ocean', accent: '#356fa5' },
  { id: 'pine', name: 'Pine', accent: '#27795e' },
  { id: 'iris', name: 'Iris', accent: '#7656a6' },
  { id: 'ember', name: 'Ember', accent: '#ad563d' },
  { id: 'graphite', name: 'Graphite', accent: '#647184' },
  { id: 'custom', name: 'Custom', accent: '#586bd6' }
] as const;
export type ThemePreset = typeof THEME_PRESETS[number]['id'];
export type ThemeMode = 'system' | 'light' | 'dark';
export interface WorkspaceTheme { preset: ThemePreset; mode: ThemeMode; accent?: string }
export const DEFAULT_THEME: WorkspaceTheme = { preset: 'quo', mode: 'system' };
export interface ThemeColors {
  surface: string; elevated: string; sidebar: string; hover: string; border: string;
  text: string; secondary: string; tertiary: string; accent: string; accentHover: string; accentPressed: string; accentText: string;
  accentStrong: string; onAccent: string; selection: string; callBackground: string; callHighlight: string;
}
export interface ResolvedTheme { dark: boolean; original: boolean; colors: ThemeColors }
export interface AppearanceOptions { macFonts: boolean; theme: WorkspaceTheme; resolved: ResolvedTheme; increaseContrast: boolean; reduceMotion: boolean }

export function validTheme(value: unknown): value is WorkspaceTheme {
  if (!value || typeof value !== 'object') return false;
  const theme = value as WorkspaceTheme;
  return THEME_PRESETS.some(preset => preset.id === theme.preset) && ['system', 'light', 'dark'].includes(theme.mode)
    && (theme.accent === undefined || typeof theme.accent === 'string' && /^#[0-9a-f]{6}$/i.test(theme.accent)) && (theme.preset !== 'custom' || theme.accent !== undefined);
}
export function cleanTheme(theme: WorkspaceTheme): WorkspaceTheme {
  return { preset: theme.preset, mode: theme.mode, ...(theme.accent ? { accent: theme.accent.toLowerCase() } : {}) };
}
export function contrast(foreground: string, background: string): number { return Color.contrast(foreground, background, 'WCAG21'); }
export function channels(hex: string): string { return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(', '); }

const cache = new Map<string, ResolvedTheme>();
export function resolveTheme(theme = DEFAULT_THEME, systemDark = false, increaseContrast = false, systemAccent = '#007aff'): ResolvedTheme {
  const dark = theme.mode === 'system' ? systemDark : theme.mode === 'dark';
  const seed = theme.preset === 'mac' ? systemAccent : theme.preset === 'custom' ? theme.accent! : THEME_PRESETS.find(preset => preset.id === theme.preset)!.accent;
  const key = JSON.stringify([theme.preset, seed, dark, increaseContrast, theme.mode]);
  const cached = cache.get(key); if (cached) return cached;
  const coordinates = new Color(seed).to('oklch').coords;
  const hue = Number.isFinite(coordinates[2]) ? coordinates[2]! : 265;
  const chroma = theme.preset === 'graphite' ? 0.035 : Math.max(0.08, Math.min(coordinates[1]!, 0.18));
  const neutralChroma = theme.preset === 'mac' || theme.preset === 'quo' || theme.preset === 'graphite' ? 0.003 : 0.012;
  const color = (lightness: number, saturation = neutralChroma) => new Color('oklch', [lightness, saturation, hue]).to('srgb').toGamut().toString({ format: 'hex', collapse: false });
  const fit = (start: number, saturation: number, backgrounds: string[], target: number, direction: number) => {
    for (let i = 0; i <= 100; i++) {
      const value = color(Math.max(0, Math.min(1, start + i * 0.005 * direction)), saturation);
      if (backgrounds.every(background => contrast(value, background) >= target)) return value;
    }
    throw new Error('Could not produce a readable theme color');
  };
  const surface = color(dark ? 0.20 : 0.995), elevated = color(dark ? 0.25 : 1), sidebar = color(dark ? 0.18 : 0.965), hover = color(dark ? 0.29 : 0.925);
  const selection = color(dark ? 0.31 : 0.90, 0.035);
  const backgrounds = [surface, elevated, sidebar, hover, selection];
  const target = increaseContrast ? 7 : 4.5;
  const text = fit(dark ? 0.96 : 0.22, neutralChroma, backgrounds, target, dark ? 1 : -1);
  const secondary = fit(dark ? 0.78 : 0.46, neutralChroma, backgrounds, target, dark ? 1 : -1);
  const tertiary = fit(dark ? 0.70 : 0.51, neutralChroma, backgrounds, target, dark ? 1 : -1);
  // Solid controls retain white labels. Foreground accents use a separate role.
  const accent = fit(0.56, chroma, ['#ffffff'], target, -1);
  const solidLightness = new Color(accent).to('oklch').coords[0]!;
  const accentHover = fit(solidLightness - 0.035, chroma, ['#ffffff'], target, -1);
  const accentPressed = fit(solidLightness - 0.07, chroma, ['#ffffff'], target, -1);
  const accentText = fit(dark ? 0.78 : 0.49, chroma, backgrounds, target, dark ? 1 : -1);
  const accentStrong = fit(dark ? 0.87 : 0.38, chroma, backgrounds, target, dark ? 1 : -1);
  const colors: ThemeColors = { surface, elevated, sidebar, hover, border: fit(dark ? 0.55 : 0.64, neutralChroma, [surface, elevated, sidebar], increaseContrast ? 4.5 : 3, dark ? 1 : -1),
    text, secondary, tertiary, accent, accentHover, accentPressed, accentText, accentStrong, onAccent: '#ffffff', selection, callBackground: color(0.18, 0.016), callHighlight: color(0.28, 0.022) };
  const result = { dark, original: theme.preset === 'quo' && theme.mode === 'system', colors };
  if (cache.size >= 96) cache.clear();
  cache.set(key, result);
  return result;
}
