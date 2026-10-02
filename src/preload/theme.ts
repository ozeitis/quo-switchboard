import { channels, type AppearanceOptions } from '../shared/theme';
import { QUO_LIGHT, QUO_DARK, QUO_CONTRACTS } from './theme-contract';

export function contractHash(values: readonly string[]): number {
  let hash = 2166136261;
  for (const character of values.join('|').replace(/\s/g, '')) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

interface Contract { prefix: string; selectors: string[]; foreground: string; exceptions: { selector: string; property: string; role: 'text' | 'hover' | 'elevated' }[] }
export function discoverTheme(sheets: readonly CSSStyleSheet[]): Contract | null {
  let prefix = '';
  const selectors: string[] = [];
  const foreground: { rule: CSSStyleRule; wrappers: string[] }[] = [];
  let incompatible = false;
  const visit = (rules: CSSRuleList, wrappers: string[] = []) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        for (const property of Array.from(rule.style)) {
          if (!property.startsWith('--') || !property.endsWith('26') || rule.style.getPropertyValue(property).replace(/\s/g, '') !== '255,255,255') continue;
          const candidate = property.slice(0, -2);
          const values = Array.from({ length: 88 }, (_, index) => rule.style.getPropertyValue(candidate + index.toString(36)).trim());
          if (values.some(value => !value)) continue;
          if (!QUO_CONTRACTS.has(contractHash(values)) || (prefix && prefix !== candidate)) { incompatible = true; continue; }
          prefix = candidate; selectors.push(rule.selectorText);
        }
        foreground.push({ rule, wrappers });
      } else if ('cssRules' in rule) {
        const header = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
        visit((rule as CSSGroupingRule).cssRules, [...wrappers, header]);
      }
    }
  };
  for (const sheet of sheets) { try { if (!sheet.disabled) visit(sheet.cssRules); } catch { /* Cross-origin styles cannot grant compatibility. */ } }
  if (!prefix || incompatible) return null;
  // Quo uses its primary token for both solid buttons and text. Separate those
  // roles so links stay readable in dark mode without dimming white button labels.
  const replacements = foreground.flatMap(({ rule, wrappers }) => {
    const properties = ['color', 'fill', 'stroke', 'caret-color', 'text-decoration-color'].flatMap(property => {
      const value = rule.style.getPropertyValue(property);
      const replaced = [0, 1, 2].reduce((text, index) => text.replaceAll(`var(${prefix}${index})`, index === 0 ? 'var(--switchboard-accent-text)' : 'var(--switchboard-accent-strong-text)'), value);
      return replaced !== value ? [`${property}:${replaced} !important;`] : [];
    });
    const css = `html:has(#sideMenu) :is(${rule.selectorText}){${properties.join('')}}`;
    return properties.length ? [wrappers.reduceRight((text, header) => `${header}{${text}}`, css)] : [];
  }).join('\n');
  const exceptions = foreground.flatMap(({ rule }) => {
    const roles: { selector: string; property: string; role: 'text' | 'hover' | 'elevated' }[] = [];
    const literal = rule.style.getPropertyValue('color').replace(/\s/g, '');
    if (literal === 'rgb(14,15,23)' || (literal === 'rgb(255,255,255)' && selectors.some(selector => rule.selectorText.startsWith(selector + ' ')))) roles.push({ selector: rule.selectorText, property: 'color', role: 'text' });
    const background = rule.style.getPropertyValue('background-color').replace(/\s/g, '');
    if (['rgb(247,242,253)', 'rgb(48,45,68)'].includes(background)) roles.push({ selector: rule.selectorText, property: 'background-color', role: 'hover' });
    if (rule.selectorText.includes('.pac-container') && ['rgb(255,255,255)', 'rgb(76,74,111)'].includes(background)) roles.push({ selector: rule.selectorText, property: 'background-color', role: 'elevated' });
    return roles;
  });
  return { prefix, selectors, foreground: replacements, exceptions };
}

export function themeCSS(contract: Contract, options: AppearanceOptions): string {
  const { colors: c, dark } = options.resolved;
  const values = [...(dark ? QUO_DARK : QUO_LIGHT)];
  const set = (suffixes: string[], color: string, alpha?: number) => {
    for (const suffix of suffixes) values[parseInt(suffix, 36)] = channels(color) + (alpha === undefined ? '' : `, ${alpha}`);
  };
  set(['0'], c.accent); set(['1'], c.accentHover); set(['2'], c.accentPressed);
  set(['3', 'o'], c.accentText, 0.14); set(['4', '5', '6', '7'], c.selection);
  set(['8'], c.text); set(['9'], c.secondary); set(['a'], c.tertiary); set(['b', 'r'], c.border);
  set(['c'], c.hover); set(['d', 'i', 'g'], c.sidebar); set(['e'], c.surface); set(['f', 'h'], c.elevated);
  set(['l'], c.text, 0.10); set(['m'], c.text, 0.16); set(['n'], c.text, 0.05);
  set(['24'], c.text, 0.20); set(['25'], c.text, 0.08);
  set(['28'], c.callBackground); set(['29'], c.callHighlight);
  const declarations = values.map((value, index) => `${contract.prefix}${index.toString(36)}:${value} !important;`).join('\n');
  const providers = ['html', 'body', ...contract.selectors];
  return `html:has(#sideMenu) :is(${providers.join(',')}), html:has(#sideMenu) { ${declarations}
    --switchboard-accent-text:${channels(c.accentText)} !important; --switchboard-accent-strong-text:${channels(c.accentStrong)} !important; color-scheme:${dark ? 'dark' : 'light'} !important; }
    ${contract.foreground}
    ${contract.exceptions.map(({ selector, property, role }) => `html:has(#sideMenu) :is(${selector}) { ${property}:${c[role]} !important; }`).join('\n')}
    html:has(#sideMenu) :is(.pac-container,.pac-item) { color:${c.text} !important; }
    html:has(#sideMenu) .pac-item:hover { background:${c.hover} !important; }
    html:has(#sideMenu) [data-content-type=quote] blockquote {color:${c.secondary} !important; border-color:${c.border} !important;}
    html:has(#sideMenu) .ProseMirror .column-resize-handle {background:${c.accent} !important;}
    html:has(#sideMenu) .ProseMirror .selectedCell:after {background:${c.selection} !important;}
    html:has(#sideMenu) .plyr {
      --plyr-color-main:${c.accent} !important; --plyr-audio-controls-background:${c.elevated} !important;
      --plyr-audio-control-color:${c.text} !important; --plyr-audio-control-background-hover:${c.accent} !important;
      --plyr-audio-control-color-hover:${c.onAccent} !important; --plyr-menu-background:${c.elevated} !important;
      --plyr-menu-color:${c.text} !important; --plyr-menu-border-color:${c.border} !important;
      --plyr-tooltip-background:${c.elevated} !important; --plyr-tooltip-color:${c.text} !important;
      --plyr-menu-back-border-color:${c.border} !important; --plyr-menu-arrow-color:${c.secondary} !important;
    }
    html:has(#sideMenu) :is(.bn-container,.bn-mantine) {
      --bn-colors-editor-text:${c.text} !important; --bn-colors-editor-background:${c.surface} !important;
      --bn-colors-menu-text:${c.text} !important; --bn-colors-menu-background:${c.elevated} !important;
      --bn-colors-tooltip-text:${c.text} !important; --bn-colors-tooltip-background:${c.elevated} !important;
      --bn-colors-hovered-text:${c.text} !important; --bn-colors-hovered-background:${c.hover} !important;
      --bn-colors-selected-text:${c.onAccent} !important; --bn-colors-selected-background:${c.accent} !important;
      --bn-colors-disabled-text:${c.tertiary} !important; --bn-colors-disabled-background:${c.sidebar} !important;
      --bn-colors-border:${c.border} !important; --bn-colors-side-menu:${c.secondary} !important;
      --mantine-color-body:${c.surface} !important; --mantine-color-text:${c.text} !important; --mantine-color-dimmed:${c.secondary} !important;
      --mantine-primary-color-filled:${c.accent} !important; --mantine-primary-color-filled-hover:${c.accentHover} !important; --mantine-primary-color-light-color:${c.accentText} !important;
      --mantine-primary-color-light:${c.selection} !important; --mantine-primary-color-contrast:${c.onAccent} !important;
      ${Array.from({ length: 10 }, (_, i) => `--mantine-color-gray-${i}:${i < 3 ? c.sidebar : i < 5 ? c.hover : i < 7 ? c.border : c.secondary} !important;`).join('')}
    }
    ${options.reduceMotion ? 'html:has(#sideMenu) *,html:has(#sideMenu) *::before,html:has(#sideMenu) *::after{animation-duration:0.01ms !important; animation-iteration-count:1 !important; transition-duration:0.01ms !important; scroll-behavior:auto !important;}' : ''}`;
}
