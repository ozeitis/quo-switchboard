import { webFrame } from 'electron';
import type { ThemeSupport } from '../shared/model';
import type { AppearanceOptions } from '../shared/theme';
import { discoverTheme, themeCSS } from './theme';

const systemFont = '-apple-system, BlinkMacSystemFont, "Apple Color Emoji", sans-serif';
const sidebarStyle = '#sideMenu { width:248px !important; min-width:248px !important; max-width:248px !important; flex-shrink:0 !important; }';

/** Presentation only. Credentials, Quo preferences and call controls remain owned by Quo. */
export class DesktopAppearance {
  private options?: AppearanceOptions;
  private fontKey?: string;
  private colorKey?: string;
  private key = '';
  private sheetKey = '';
  private contract: ReturnType<typeof discoverTheme> = null;
  support: ThemeSupport = 'unmodified';
  constructor() { webFrame.insertCSS(sidebarStyle, { cssOrigin: 'user' }); }

  configure(options: AppearanceOptions): void { this.options = options; this.update(); }
  invalidate(): void { this.sheetKey = ''; this.key = ''; }
  update(): void {
    const signingIn = /\/(login|signin|sign-in)(\/|$)/i.test(location.pathname) || !!document.querySelector('input[autocomplete="current-password"],input[autocomplete="one-time-code"]');
    const sidebar = signingIn ? null : document.getElementById('sideMenu');
    const options = this.options;
    const sheets = Array.from(document.styleSheets);
    const sheetKey = sheets.map(sheet => { try { return `${sheet.href}:${sheet.disabled}:${sheet.cssRules.length}`; } catch { return sheet.href; } }).join('|');
    if (sidebar && sheetKey !== this.sheetKey) { this.contract = discoverTheme(sheets); this.sheetKey = sheetKey; }
    this.support = !options || options.resolved.original ? 'unmodified' : !sidebar ? 'waiting' : this.contract ? 'compatible' : 'unsupported';
    const ancestors: Element[] = [];
    for (let node = sidebar?.parentElement; node; node = node.parentElement) ancestors.push(node);
    const key = JSON.stringify([options, this.support, sheetKey, ancestors.map(node => node.className)]);
    if (key === this.key) return;
    this.key = key;
    if (this.fontKey) { webFrame.removeInsertedCSS(this.fontKey); this.fontKey = undefined; }
    if (this.colorKey) { webFrame.removeInsertedCSS(this.colorKey); this.colorKey = undefined; }
    if (!sidebar?.parentElement || !options) return;
    if (options.macFonts) {
      // Preserve dyslexia, emoji, signature and monospace fonts.
      const styles = getComputedStyle(sidebar.parentElement);
      const tokens = Array.from(styles).filter(name => /^--[\w-]+$/.test(name)
        && /^(Inter|Roobert)(,|$)/i.test(styles.getPropertyValue(name).trim()));
      if (tokens.length) this.fontKey = webFrame.insertCSS(`html:has(#sideMenu), html:has(#sideMenu) :is(body,#sideMenu,main${this.contract ? ',' + this.contract.selectors.join(',') : ''}) { ${tokens.map(name => `${name}:${systemFont} !important;`).join('')} }`);
    }
    if (this.support === 'compatible' && this.contract) this.colorKey = webFrame.insertCSS(themeCSS(this.contract, options));
  }
}
