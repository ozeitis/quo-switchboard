import { contextBridge, ipcRenderer } from 'electron';
import { hasActiveCall, findAnswerButton } from './call-controls';
import type { AccountEvent } from '../shared/model';

export function installWebUpdates(): void {
  window.addEventListener('switchboard:web-update-event', event => {
    try { ipcRenderer.send('account:event', JSON.parse((event as CustomEvent<string>).detail) as AccountEvent); } catch { /* Ignore malformed page events. */ }
  });
  window.addEventListener('switchboard:web-update-confirm', event => {
    try {
      const request = JSON.parse((event as CustomEvent<string>).detail);
      if (hasActiveCall(document) || findAnswerButton(document)) {
        ipcRenderer.send('account:event', { type: 'web-update-result', requestId: request.requestId, result: 'busy' }); return;
      }
      window.dispatchEvent(new CustomEvent('switchboard:web-update-commit', { detail: JSON.stringify(request) }));
    } catch { /* Ignore malformed page events. */ }
  });
  contextBridge.executeInMainWorld({ func: updatesInPage });
  ipcRenderer.on('account:web-update', (_event, request: { requestId: string; operation: 'check' | 'apply'; updateId?: string }) => {
    if (hasActiveCall(document) || findAnswerButton(document)) {
      ipcRenderer.send('account:event', { type: 'web-update-result', requestId: request.requestId, result: 'busy' }); return;
    }
    window.dispatchEvent(new CustomEvent('switchboard:web-update-command', { detail: JSON.stringify(request) }));
  });
}

function updatesInPage(): void {
  const service = navigator.serviceWorker;
  if (!service) return;
  let current: ServiceWorker | null = null;
  let updateId: string | null = null;
  let last: string | null | undefined;
  const watched = new WeakSet<ServiceWorkerRegistration>();
  const send = (value: object) => window.dispatchEvent(new CustomEvent('switchboard:web-update-event', { detail: JSON.stringify(value) }));
  const supported = (registration: ServiceWorkerRegistration) => {
    const worker = registration.waiting ?? registration.installing ?? registration.active;
    return registration.scope === `${location.origin}/` && !!worker && new URL(worker.scriptURL).origin === location.origin && new URL(worker.scriptURL).pathname === '/sw.js';
  };
  async function registration(): Promise<ServiceWorkerRegistration | undefined> {
    const found = (await service.getRegistrations()).find(supported);
    if (found && !watched.has(found)) {
      watched.add(found); found.addEventListener('updatefound', () => {
        found.installing?.addEventListener('statechange', () => { void refresh(); }); void refresh();
      });
    }
    return found;
  }
  async function refresh(): Promise<void> {
    const found = await registration().catch(() => undefined);
    const waiting = found?.active ? found.waiting : null;
    if (waiting !== current) { current = waiting; updateId = waiting ? crypto.randomUUID() : null; }
    if (last !== updateId) { last = updateId; send({ type: 'web-update-state', updateId }); }
  }
  async function installed(found: ServiceWorkerRegistration): Promise<void> {
    const worker = found.installing;
    if (!worker || worker.state === 'installed' || worker.state === 'activated') return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => finish(false), 30_000);
      const changed = () => { if (['installed', 'activated', 'redundant'].includes(worker.state)) finish(worker.state !== 'redundant'); };
      function finish(ok: boolean) { clearTimeout(timeout); worker!.removeEventListener('statechange', changed); ok ? resolve() : reject(new Error('Web update unavailable')); }
      worker.addEventListener('statechange', changed); changed();
    });
  }
  window.addEventListener('switchboard:web-update-command', event => {
    void (async () => {
      const request = JSON.parse((event as CustomEvent<string>).detail);
      let result = 'error';
      try {
        const found = await registration();
        if (!found?.active) result = 'unsupported';
        else if (request.operation === 'check') {
          await found.update(); await installed(found); await refresh(); result = found.waiting ? 'ready' : 'current';
        } else if (request.operation === 'apply') {
          await refresh();
          if (!current || request.updateId !== updateId) result = 'stale';
          else {
            window.dispatchEvent(new CustomEvent('switchboard:web-update-confirm', { detail: JSON.stringify(request) })); return;
          }
        }
      } catch { result = 'error'; }
      send({ type: 'web-update-result', requestId: request.requestId, result });
    })().catch(() => undefined);
  });
  window.addEventListener('switchboard:web-update-commit', event => {
    try {
      const request = JSON.parse((event as CustomEvent<string>).detail);
      const accepted = !!current && request.updateId === updateId && current.state === 'installed';
      // Quo's own controllerchange listener performs the reload.
      if (accepted) current!.postMessage({ type: 'SKIP_WAITING' });
      send({ type: 'web-update-result', requestId: request.requestId, result: accepted ? 'applied' : 'stale' });
    } catch { /* Ignore malformed page events. */ }
  });
  service.addEventListener('controllerchange', () => { void refresh(); });
  void service.ready.then(() => refresh()).catch(() => undefined);
  void refresh(); const timer = setInterval(() => { void refresh(); }, 10_000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
