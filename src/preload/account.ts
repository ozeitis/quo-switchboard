import { contextBridge, ipcRenderer } from 'electron';
import type { AccountEvent } from '../shared/model';
import { appOrigin } from '../main/policy';
import { findAnswerButton, hasActiveCall, readCallState, callButtons } from './call-controls';
import { DesktopAppearance } from './appearance';
import { installAudio } from './audio';
import { installWebUpdates } from './web-updates';
import { UnreadCounter } from './unread';

// This preload never receives account credentials or exposes Electron APIs to Quo.
if (appOrigin(location.href) && process.isMainFrame) {
  installAudio();
  installWebUpdates();
  const send = (event: AccountEvent) => ipcRenderer.send('account:event', event);
  const appearance = process.platform === 'darwin' ? new DesktopAppearance() : undefined;
  ipcRenderer.on('account:appearance', (_event, options: import('../shared/theme').AppearanceOptions) => {
    if (options && typeof options === 'object') { appearance?.configure(options); update(); }
  });

  window.addEventListener('switchboard:notification', event => {
    try {
      const value = JSON.parse((event as CustomEvent<string>).detail) as Record<string, unknown>;
      if (value.type === 'close' && typeof value.id === 'string') {
        send({ type: 'notification-close', id: value.id });
      } else if (value.type === 'show' && typeof value.id === 'string' && typeof value.title === 'string') {
        send({ type: 'notification', id: value.id, title: value.title.slice(0, 160), body: typeof value.body === 'string' ? value.body.slice(0, 500) : '', tag: typeof value.tag === 'string' ? value.tag.slice(0, 120) : '', silent: value.silent === true });
      }
    } catch { /* Ignore malformed page events. */ }
  });

  contextBridge.executeInMainWorld({ func: () => {
    const NativeNotification = window.Notification;
    if (!NativeNotification) return;
    const notifications = new Map<string, ForwardedNotification>();
    class ForwardedNotification extends EventTarget {
      readonly id = crypto.randomUUID();
      readonly title: string;
      readonly body: string;
      readonly tag: string;
      readonly data: unknown;
      readonly icon: string;
      readonly silent: boolean | null;
      readonly dir: NotificationDirection;
      readonly lang: string;
      readonly requireInteraction: boolean;
      onclick: ((event: Event) => void) | null = null;
      onclose: ((event: Event) => void) | null = null;
      onshow: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(title: string, options: NotificationOptions = {}) {
        super();
        this.title = String(title);
        this.body = options.body ?? '';
        this.tag = options.tag ?? '';
        this.data = options.data;
        this.icon = options.icon ?? '';
        this.silent = options.silent ?? null;
        this.dir = options.dir ?? 'auto';
        this.lang = options.lang ?? '';
        this.requireInteraction = options.requireInteraction ?? false;
        if (notifications.size >= 100) notifications.delete(notifications.keys().next().value!);
        notifications.set(this.id, this);
        window.dispatchEvent(new CustomEvent('switchboard:notification', { detail: JSON.stringify({ type: 'show', id: this.id, title: this.title, body: this.body, tag: this.tag, silent: this.silent }) }));
      }
      static get permission() { return NativeNotification.permission; }
      static requestPermission(callback?: NotificationPermissionCallback) {
        return NativeNotification.requestPermission(callback);
      }
      close() {
        window.dispatchEvent(new CustomEvent('switchboard:notification', { detail: JSON.stringify({ type: 'close', id: this.id }) }));
        this.deliver('close');
      }
      deliver(type: string) {
        if (!['click', 'close', 'show', 'error'].includes(type)) return;
        const event = new Event(type);
        this.dispatchEvent(event);
        const handler = this[`on${type}` as 'onclick' | 'onclose' | 'onshow' | 'onerror'];
        handler?.call(this, event);
        if (type === 'close' || type === 'error') notifications.delete(this.id);
      }
    }
    window.addEventListener('switchboard:notification-result', event => {
      try {
        const value = JSON.parse((event as CustomEvent<string>).detail);
        notifications.get(value.id)?.deliver(value.type);
      } catch { /* Ignore unrelated events. */ }
    });
    Object.defineProperty(window, 'Notification', { value: ForwardedNotification, configurable: true, writable: true });
  } });

  ipcRenderer.on('account:notification-result', (_event, id: string, type: string) => {
    window.dispatchEvent(new CustomEvent('switchboard:notification-result', { detail: JSON.stringify({ id, type }) }));
  });

  let ring: { id: string; button: HTMLElement } | null = null;
  let lastState = '';
  let callId: string | undefined;
  let currentAnchor: HTMLElement | undefined;
  const unread = new UnreadCounter();
  const update = () => {
    appearance?.update();
    const button = findAnswerButton(document);
    if (ring && button !== ring.button) {
      send({ type: 'ring-end', id: ring.id });
      ring = null;
    }
    if (button && !ring) {
      ring = { id: crypto.randomUUID(), button };
      send({ type: 'ring', id: ring.id });
    }
    const signIn = /\/(login|signin|sign-in|auth)(\/|$)/i.test(location.pathname)
      || !!document.querySelector('input[autocomplete="current-password"], input[autocomplete="one-time-code"]');
    const buttons = callButtons(document);
    const anchor = buttons.answer ?? buttons.end;
    if (!anchor) { callId = undefined; currentAnchor = undefined; }
    else if (!callId || (currentAnchor !== anchor)) { callId = crypto.randomUUID(); }
    currentAnchor = anchor;
    const state: AccountEvent = {
      type: 'state', status: !navigator.onLine ? 'offline' : signIn ? 'sign-in' : 'ready',
      ...(signIn ? { unread: 0, unreadKnown: false } : unread.read(document)),
      ...readCallState(document), callId, callActions: Object.keys(buttons) as import('../shared/model').CallAction[], themeSupport: appearance?.support ?? 'unmodified'
    };
    const encoded = JSON.stringify(state);
    if (encoded !== lastState) { lastState = encoded; send(state); }
  };

  ipcRenderer.on('account:call-action', (_event, request: { requestId: string; callId: string; action: import('../shared/model').CallAction }) => {
    update();
    const target = request.callId === callId ? callButtons(document)[request.action] : undefined;
    const clicked = !!target && (request.action !== 'answer' || !hasActiveCall(document));
    if (clicked) target!.click();
    send({ type: 'call-action-result', requestId: request.requestId, clicked });
    update();
  });

  window.addEventListener('switchboard:answer', event => {
    const id = (event as CustomEvent<string>).detail;
    const current = ring;
    const clicked = !!current && id === current.id && findAnswerButton(document) === current.button && !hasActiveCall(document);
    if (clicked) current!.button.click();
    send({ type: 'answer-result', id, clicked });
  });
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  const heartbeat = () => { appearance?.invalidate(); update(); send({ type: 'heartbeat' }); };
  ipcRenderer.on('account:probe', heartbeat);
  window.addEventListener('DOMContentLoaded', () => {
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; update(); }, 180);
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'disabled', 'aria-disabled', 'aria-pressed', 'style', 'class'], characterData: true });
    new MutationObserver(() => { appearance?.invalidate(); update(); }).observe(document.head, { subtree: true, childList: true, characterData: true });
    document.addEventListener('load', event => { if (event.target instanceof HTMLLinkElement) { appearance?.invalidate(); update(); } }, true);
    heartbeat();
    setInterval(heartbeat, 10_000);
  });
}
