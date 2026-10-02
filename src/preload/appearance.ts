import { webFrame } from 'electron';

const systemFont = '-apple-system, BlinkMacSystemFont, "Apple Color Emoji", sans-serif';
const sidebarStyle = `#sideMenu { width: 248px !important; min-width: 248px !important; max-width: 248px !important; flex-shrink: 0 !important; }`;

/** A small presentation adapter. It never changes Quo's controls or application state. */
export class DesktopAppearance {
  private enabled = true;
  private fontKey?: string;
  private theme = '';
  constructor() { webFrame.insertCSS(sidebarStyle, { cssOrigin: 'user' }); }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.theme = '';
    this.update();
  }

  update(): void {
    const sidebar = document.getElementById('sideMenu');
    const ancestors: Element[] = [];
    for (let node = sidebar?.parentElement; node; node = node.parentElement) ancestors.push(node);
    const theme = `${this.enabled}:${ancestors.map(node => node.className).join('/')}`;
    if (theme === this.theme) return;
    this.theme = theme;
    if (this.fontKey) { webFrame.removeInsertedCSS(this.fontKey); this.fontKey = undefined; }
    if (!this.enabled || !sidebar?.parentElement) return;

    // Discover typography tokens instead of relying on Quo's generated class names.
    // Keep its dyslexia, monospace, handwriting, and emoji fonts intact.
    const styles = getComputedStyle(sidebar.parentElement);
    const tokens = Array.from(styles).filter(name => /^--[\w-]+$/.test(name)
      && /^(Inter|Roobert)(,|$)/i.test(styles.getPropertyValue(name).trim()));
    if (!tokens.length) return;
    const declarations = tokens.map(name => `${name}: ${systemFont} !important;`).join('\n');
    this.fontKey = webFrame.insertCSS(`#sideMenu, html:has(#sideMenu) main { ${declarations} }`);
  }
}
