import { Notification, dialog, type BrowserWindow } from 'electron';
import type { LiveAccount, Accounts } from './accounts';
import { cleanText } from './policy';
import { randomUUID } from 'node:crypto';
import type { ActivityItem, Preferences } from '../shared/model';
import type { Calls } from './calls';

interface Delivered {
  accountId: string;
  pageId: string | null;
  tag: string;
  notification: Notification;
  timer?: ReturnType<typeof setTimeout>;
}

export class Notifications {
  private delivered = new Map<string, Delivered>();
  private history: (ActivityItem & { pageId: string })[] = [];
  private previews = new Map<string, { ringId: string; title: string; body: string }>();
  callPreview(id: string): { title: string; body: string } | undefined {
    const preview = this.previews.get(id);
    return preview && preview.ringId === this.accounts.entries.get(id)?.ringId ? { title: preview.title, body: preview.body } : undefined;
  }
  activity(): ActivityItem[] { return this.history.map(({ pageId: _page, ...item }) => this.preferences().privateNotifications ? { ...item, title: 'Quo activity', body: 'Open the workspace to view it.' } : item); }
  openActivity(id: string): void {
    const item = this.history.find(item => item.id === id); const entry = item && this.accounts.entries.get(item.workspaceId);
    if (item && entry) { this.select(entry.state.id); this.pageEvent(entry, item.pageId, 'click'); }
  }
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(
    private window: BrowserWindow,
    private accounts: Accounts,
    private preferences: () => Preferences,
    private select: (id: string) => void,
    private failed: () => void,
    private changed: () => void,
    private calls: Calls
  ) {}

  forward(entry: LiveAccount, pageId: string, title: string, body: string, tag: string, silent: boolean): void {
    const key = `${entry.state.id}:${pageId}`;
    if (this.delivered.has(key) || this.pending.has(key)) return;
    this.history.unshift({ id: randomUUID(), workspaceId: entry.state.id, pageId, title: cleanText(title, 160), body: cleanText(body, 160), at: Date.now() });
    this.history.splice(20); this.changed();
    const callLike = /\b(incoming call|is calling|calling you|call from)\b/i.test(`${title} ${body}`);
    const observedRing = entry.ringId;
    const timer = setTimeout(() => {
      this.pending.delete(key);
      if (callLike && observedRing && observedRing !== entry.ringId) return;
      if (callLike && entry.state.inCall && !entry.ringId) return;
      if (callLike && entry.ringId) {
        this.previews.set(entry.state.id, { ringId: entry.ringId, title: cleanText(title, 160), body: cleanText(body, 500) });
        const ringKey = `${entry.state.id}:ring:${entry.ringId}`;
        this.close(ringKey);
        this.show(entry, ringKey, pageId, title, body, 'incoming-call', true, entry.ringId);
        this.changed();
        return;
      }
      this.show(entry, key, pageId, title, body, tag, silent);
    }, callLike ? 350 : 0);
    this.pending.set(key, timer);
  }

  ring(entry: LiveAccount): void {
    if (!entry.ringId) return;
    const id = entry.ringId, key = `${entry.state.id}:ring:${id}`;
    const timer = setTimeout(() => {
      this.pending.delete(key);
      if (entry.ringId === id) this.show(entry, key, null, 'Incoming call', 'Open this workspace to manage the call.', 'incoming-call', true, id);
    }, 150);
    this.pending.set(key, timer);
  }

  endRing(entry: LiveAccount, id: string): void {
    this.close(`${entry.state.id}:ring:${id}`);
    if (this.previews.get(entry.state.id)?.ringId === id) this.previews.delete(entry.state.id);
  }

  test(entry: LiveAccount): void {
    this.show(entry, `${entry.state.id}:test:${Date.now()}`, null, 'Test notification', 'Click to open this workspace.', 'test', false);
  }

  private show(entry: LiveAccount, key: string, pageId: string | null, title: string, body: string, tag: string, silent: boolean, ringId?: string): void {
    if (!this.preferences().notifications || !Notification.isSupported() || this.delivered.has(key)) return;
    for (const [oldKey, old] of this.delivered) {
      if (old.accountId === entry.state.id && tag && old.tag === tag) this.close(oldKey);
    }
    if (this.delivered.size >= 50) this.close(this.delivered.keys().next().value!);
    const canAnswer = !!ringId && this.preferences().experimentalAnswer;
    const actions = [{ type: 'button' as const, text: canAnswer ? 'Answer' : ringId ? 'Open call' : 'Open workspace' }];
    if (ringId && entry.state.callActions?.includes('decline')) actions.push({ type: 'button', text: 'Decline' });
    const notification = new Notification({
      id: key,
      groupId: entry.state.id,
      title: entry.state.name,
      subtitle: this.preferences().privateNotifications ? 'Quo activity' : cleanText(title, 160),
      body: this.preferences().privateNotifications ? 'Open your workspace to view it.' : cleanText(body, 500),
      silent,
      actions,
      closeButtonText: 'Dismiss'
    });
    const open = () => {
      if (!this.accounts.entries.has(entry.state.id)) return;
      this.select(entry.state.id);
      if (pageId) this.pageEvent(entry, pageId, 'click');
    };
    notification.on('click', open);
    notification.on('action', (_event, index: number) => {
      if (ringId && (canAnswer || index === 1)) void this.callAction(entry, ringId, index === 1 ? 'decline' : 'answer');
      else open();
    });
    notification.on('show', () => { if (pageId) this.pageEvent(entry, pageId, 'show'); });
    // macOS can finish closing an alert after its replacement was registered.
    const forgetCurrent = () => { if (this.delivered.get(key)?.notification === notification) this.forget(key); };
    notification.on('failed', () => { this.failed(); if (pageId) this.pageEvent(entry, pageId, 'error'); forgetCurrent(); });
    notification.on('close', () => { if (pageId) this.pageEvent(entry, pageId, 'close'); forgetCurrent(); });
    const timer = ringId ? undefined : setTimeout(() => this.close(key), 300_000);
    this.delivered.set(key, { accountId: entry.state.id, pageId, tag, notification, timer });
    notification.show();
  }

  simulation(entry: LiveAccount, callId: string, answer: () => void): void {
    if (!this.preferences().notifications || !Notification.isSupported()) return;
    const key = `${entry.state.id}:simulation:${callId}`;
    const notification = new Notification({ title: entry.state.name, subtitle: 'Test call · local simulation', body: 'No phone call is placed. Answer to test the local controls.', actions: [{ type: 'button', text: 'Answer' }], closeButtonText: 'Dismiss' });
    notification.on('click', () => this.select(entry.state.id));
    notification.on('action', answer);
    notification.on('failed', () => this.failed());
    notification.on('close', () => this.forget(key));
    const timer = setTimeout(() => this.close(key), 60_000);
    this.delivered.set(key, { accountId: entry.state.id, pageId: null, tag: 'test-call', notification, timer }); notification.show();
  }

  private async callAction(entry: LiveAccount, id: string, action: 'answer' | 'decline'): Promise<void> {
    if (entry.ringId !== id || (action === 'answer' && !this.preferences().experimentalAnswer)) return;
    const callId = entry.state.callId;
    if (!callId || !await this.calls.perform(entry.state.id, callId, action)) {
      await dialog.showMessageBox(this.window, {
        type: 'info', message: 'The call control is unavailable.',
        detail: 'The call may have changed, or another workspace has an active call. Manage it in Quo.'
      });
      return;
    }
  }

  private pageEvent(entry: LiveAccount, id: string, type: string): void {
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.send('account:notification-result', id, type);
  }
  private forget(key: string): void {
    const item = this.delivered.get(key);
    if (item) clearTimeout(item.timer);
    this.delivered.delete(key);
  }
  close(key: string): void {
    const pending = this.pending.get(key);
    if (pending) { clearTimeout(pending); this.pending.delete(key); }
    const item = this.delivered.get(key);
    this.forget(key);
    item?.notification.close();
  }
  reset(accountId: string): void {
    this.previews.delete(accountId);
    this.history = this.history.filter(item => item.workspaceId !== accountId);
    for (const key of this.pending.keys()) if (key.startsWith(`${accountId}:`)) this.close(key);
    for (const [key, item] of this.delivered) if (item.accountId === accountId) this.close(key);
  }
  closePage(accountId: string, pageId: string): void {
    this.close(`${accountId}:${pageId}`);
    for (const [key, item] of this.delivered) if (item.accountId === accountId && item.pageId === pageId) this.close(key);
  }
  closeAll(): void {
    for (const key of this.pending.keys()) this.close(key);
    for (const key of this.delivered.keys()) this.close(key);
  }
}
