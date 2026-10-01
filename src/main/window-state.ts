import { screen, type BrowserWindow, type Rectangle } from 'electron';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class WindowState {
  private path: string;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(directory: string) { this.path = join(directory, 'window.json'); }
  bounds(): Partial<Rectangle> {
    try {
      const value = JSON.parse(readFileSync(this.path, 'utf8')) as Rectangle;
      if (![value.x, value.y, value.width, value.height].every(Number.isFinite)) return {};
      const area = screen.getDisplayMatching(value).workArea;
      const width = Math.min(area.width, Math.max(860, value.width));
      const height = Math.min(area.height, Math.max(580, value.height));
      return { width, height, x: Math.max(area.x, Math.min(value.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(value.y, area.y + area.height - height)) };
    } catch { return {}; }
  }
  attach(window: BrowserWindow): void {
    const save = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.save(window), 300);
      this.timer.unref();
    };
    window.on('resize', save);
    window.on('move', save);
    window.on('close', () => { clearTimeout(this.timer); this.save(window); });
  }
  private save(window: BrowserWindow): void {
    if (window.isDestroyed() || window.isFullScreen() || window.isMinimized()) return;
    try {
      writeFileSync(`${this.path}.tmp`, JSON.stringify(window.getNormalBounds()) + '\n', { mode: 0o600 });
      renameSync(`${this.path}.tmp`, this.path);
    } catch { /* Window geometry must never prevent a call or an orderly shutdown. */ }
  }
}
