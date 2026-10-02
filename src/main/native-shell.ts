import { app, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { Snapshot } from '../shared/model';
import { SHELL_LAYOUT } from '../shared/layout';

interface AppKitBridge {
  attach(handle: Buffer, layout: string, callback: (json: string) => void): void;
  update(json: string): void;
  form(id?: string): void;
  settings(): void;
  dismiss(): void;
  dispose(): void;
}

export class NativeShell {
  private bridge: AppKitBridge;
  constructor(window: BrowserWindow, command: (value: unknown) => void) {
    this.bridge = require(join(__dirname, 'native/shell.node')) as AppKitBridge;
    this.bridge.attach(window.getNativeWindowHandle(), JSON.stringify(SHELL_LAYOUT), json => {
      try { command(JSON.parse(json)); } catch { /* Malformed native messages have no authority. */ }
    });
  }
  update(snapshot: Snapshot): void { this.bridge.update(JSON.stringify(snapshot)); }
  form(id?: string): void { this.bridge.form(id); }
  settings(): void { this.bridge.settings(); }
  dismiss(): void { this.bridge.dismiss(); }
  dispose(): void { this.bridge.dispose(); }
  static enabled(): boolean {
    return process.platform === 'darwin' && (app.isPackaged || process.env.SWITCHBOARD_TEST_SHELL !== 'html');
  }
}
