import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Menu as NativeMenu, Notification as NativeNotification } from 'electron';
import { QUO_LIGHT, QUO_DARK } from '../../src/preload/theme-contract';
import { channels } from '../../src/shared/theme';

interface NativeRecord { notification: NativeNotification; title: string; body: string; subtitle: string; actions: string[] }
type MainGlobal = typeof globalThis & { notificationRecords: NativeRecord[]; externalOrigins: string[]; textMenus: { menu: NativeMenu; frameURL?: string }[]; nativeStatus: { items: { id: string; name: string; title: string }[]; accounts: import('../../src/shared/model').AccountState[]; activity: import('../../src/shared/model').ActivityItem[]; testCall?: import('../../src/shared/model').Snapshot['testCall'] }; nativeStatusAction: (json: string) => void; nativeStatusInspect: () => { id: string; title: string; image: string }[]; fixtureReduceMotion?: boolean };
type CallPanelGlobal = typeof globalThis & {
  nativeCallsInspect(): { visible: boolean; key: boolean; nonactivating: boolean; level: number; dismissed: number; sheetVisible: boolean; presentation: 'sheet' | 'panel' | 'none'; ownsAlerts: boolean; pending: number; cards: { id: string; callId: string; name: string; actions: string[]; title?: string; body?: string; busy: boolean }[] };
  nativeCallAction(json: string): void;
  fixtureCallFailures?: number;
};

const fixture = `<!doctype html><html><head><title>Quo fixture</title></head><body>
<h1>Quo test workspace</h1><button id="notify">Send notification</button><button id="ring">Simulate incoming call</button>
<button id="ambiguous">Add ambiguous control</button><div id="call"></div>
<script>
document.querySelector('#notify').onclick = () => { const n = new Notification('New message', {body: 'Fixture message', tag: 'message'}); n.onclick = () => document.body.dataset.notificationClicked = 'yes'; };
document.querySelector('#ring').onclick = () => {
 const area = document.querySelector('#call'); area.innerHTML = '<button aria-label="Answer call">Answer</button>';
 area.firstChild.onclick = () => { document.body.dataset.answered = 'yes'; area.innerHTML = '<button aria-label="End call">End</button>'; area.firstChild.onclick = () => area.replaceChildren(); };
 new Notification('Incoming call', {body: 'Taylor is calling you', tag: 'call'});
};
document.querySelector('#ambiguous').onclick = () => { const b = document.createElement('button'); b.setAttribute('aria-label', 'Answer call'); b.textContent = 'Another call'; document.querySelector('#call').append(b); };
</script></body></html>`;

const desktopFixture = fixture.replace('<head>', `<head><style>
body { margin:0; display:flex; --body-font:Inter,sans-serif; --heading-font:Roobert,Inter,sans-serif; --code-font:monospace; }
body.dyslexia { --body-font:OpenDyslexic,sans-serif; --heading-font:OpenDyslexic,sans-serif; }
#sideMenu { width:248px; flex-shrink:0; font-family:var(--body-font); }
@media(max-width:1399px) { #sideMenu { width:192px; } }
main { flex:1; min-width:0; font-family:var(--body-font); }
h1 { font-family:var(--heading-font); } code { font-family:var(--code-font); }
</style>`).replace('<body>', '<body><aside id="sideMenu"><p>Search</p><p>Contacts</p></aside><main>')
  .replace('<script>', '<textarea aria-label="Draft">Fixture draft</textarea><pre><code>monospace sample</code></pre><script>')
  .replace('</body>', '</main></body>');

const unreadFixture = desktopFixture.replace('<p>Search</p><p>Contacts</p>', `<nav aria-label="Inboxes"><div role="list">
<div role="listitem" id="line-one"><span>Line one 1234567</span><span aria-label="1 unread conversation">1</span></div>
<div role="listitem"><span aria-label="7 unread conversations">7</span></div>
<div role="listitem"><span aria-label="3 unread conversations">3</span></div>
<div role="listitem"><span aria-label="11 unread conversations">11</span></div>
<div role="listitem">Muted line</div>
</div></nav><nav aria-label="Your team"></nav>`)
  .replace('<textarea', '<span aria-label="99 unread messages">Selected conversation badge outside the sidebar</span><textarea');

let application: ElectronApplication;
let window: Page;
let dataDirectory: string;

async function launch(directory: string, restoring = false, native = false, html = fixture, worker?: string): Promise<void> {
  const fixturePath = join(directory, 'fixture.html');
  await writeFile(fixturePath, html, { mode: 0o600 });
  application = await _electron.launch({ args: [resolve('tests/desktop/bootstrap.cjs'), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: { ...process.env, SWITCHBOARD_TEST_DATA: directory, SWITCHBOARD_TEST_FIXTURE: fixturePath, SWITCHBOARD_TEST_WORKER: worker ?? '', SWITCHBOARD_TEST_SHELL: native ? 'native' : 'html' } });
  window = await application.firstWindow();
  if (!restoring) await expect(window.getByRole('button', { name: 'Add your first workspace' })).toBeVisible();
  // DOM visibility does not establish that Electron finished showing the window.
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  await application.evaluate(({ Notification, shell }) => {
    (globalThis as MainGlobal).notificationRecords = [];
    (globalThis as MainGlobal).externalOrigins = [];
    shell.openExternal = async url => { (globalThis as MainGlobal).externalOrigins.push(new URL(url).origin); };
    Notification.prototype.show = function () {
      (globalThis as MainGlobal).notificationRecords.push({ notification: this, title: this.title, body: this.body, subtitle: this.subtitle, actions: this.actions.map(action => action.text ?? '') });
      this.emit('show');
    };
    Notification.prototype.close = function () { this.emit('close'); };
  });
}

test.beforeEach(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'switchboard-desktop-'));
  await launch(dataDirectory);
});
test.afterEach(async () => {
  if (application) {
    // Fixtures may end with an active call. Confirm only the teardown quit guard.
    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }).catch(() => undefined);
    await application.close().catch(() => undefined);
  }
  await rm(dataDirectory, { recursive: true, force: true });
});

async function add(name: string): Promise<Page> {
  const pagePromise = application.context().waitForEvent('page');
  await window.getByRole('button', { name: /^Add workspace/ }).click();
  await expect(window.getByLabel('Workspace name', { exact: true })).toBeFocused();
  await window.getByLabel('Workspace name', { exact: true }).fill(name);
  await expect(window.getByLabel('Workspace name', { exact: true })).toHaveValue(name);
  await window.getByRole('dialog').getByRole('button', { name: 'Add workspace', exact: true }).click();
  const page = await pagePromise;
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: 'Quo test workspace' })).toBeVisible();
  return page;
}

async function notifications(): Promise<Omit<NativeRecord, 'notification'>[]> {
  return application.evaluate(() => (globalThis as MainGlobal).notificationRecords.map(({ title, body, subtitle, actions }) => ({ title, body, subtitle, actions })));
}

const shellCommand = (value: unknown) => window.evaluate(value => (window as unknown as { switchboard: { command(value: unknown): Promise<void> } }).switchboard.command(value), value);
async function addNative(name: string): Promise<Page> {
  const next = application.context().waitForEvent('page');
  await shellCommand({ type: 'add', name, color: 'blue' });
  const page = await next;
  await expect(page.getByRole('heading', { name: 'Quo test workspace' })).toBeVisible();
  return page;
}

test('the shell is accessible and workspace profiles isolate both cookies and local storage', async () => {
  await expect(window.getByRole('heading', { name: 'Your workspaces. All within reach.' })).toBeVisible();
  await window.screenshot({ path: 'test-results/switchboard-welcome.png' });
  const first = await add('Studio');
  await first.evaluate(() => { localStorage.setItem('identity', 'studio'); document.cookie = 'identity=studio; Secure; SameSite=Strict'; });
  const second = await add('Workshop');
  expect(await second.evaluate(() => localStorage.getItem('identity'))).toBeNull();
  expect(await second.evaluate(() => document.cookie)).not.toContain('identity=studio');
  await second.evaluate(() => { localStorage.setItem('identity', 'workshop'); document.cookie = 'identity=workshop; Secure; SameSite=Strict'; });
  await window.getByRole('button', { name: /^Studio,/ }).click();
  expect(await first.evaluate(() => localStorage.getItem('identity'))).toBe('studio');
  expect(await first.evaluate(() => document.cookie)).toContain('identity=studio');
  expect(await second.evaluate(() => typeof (window as unknown as Record<string, unknown>).switchboard)).toBe('undefined');
  expect(await second.evaluate(() => typeof (window as unknown as Record<string, unknown>).require)).toBe('undefined');
  const config = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  expect(config.accounts).toHaveLength(2);
  expect(config.accounts[0].id).not.toBe(config.accounts[1].id);
  const partitions = await application.evaluate(({ webContents }) => webContents.getAllWebContents().filter(c => c.getURL().startsWith('https://my.quo.com')).map(c => ({ id: c.id, path: c.session.getStoragePath(), throttled: c.getBackgroundThrottling() })));
  expect(new Set(partitions.map(p => p.path)).size).toBe(2);
  expect(partitions.every(p => p.throttled === false)).toBe(true);
});

test('a notification from an inactive workspace opens its source and preserves Quo’s click callback', async () => {
  const studio = await add('Studio');
  const workshop = await add('Workshop');
  await window.getByRole('button', { name: /^Studio,/ }).click();
  await workshop.evaluate(() => document.getElementById('notify')!.click());
  await expect.poll(async () => (await notifications()).length).toBe(1);
  expect((await notifications())[0]).toMatchObject({ title: 'Workshop', subtitle: 'New message', body: 'Fixture message' });
  await application.evaluate(() => (globalThis as MainGlobal).notificationRecords.at(-1)!.notification.emit('click'));
  await expect(window.locator('#workspace-title')).toHaveText('Workshop');
  await expect.poll(() => workshop.evaluate(() => document.body.dataset.notificationClicked)).toBe('yes');
  expect(await studio.evaluate(() => document.body.dataset.notificationClicked)).toBeUndefined();
});

test('answer actions target the originating call and stale actions cannot answer a later call', async () => {
  await add('Studio');
  const workshop = await add('Workshop');
  await window.locator('#settings').click();
  await window.getByRole('switch', { name: /Answer from notifications/ }).check();
  await window.getByRole('button', { name: 'Save settings' }).click();
  await window.getByRole('button', { name: /^Studio,/ }).click();
  await workshop.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await notifications()).at(-1)?.body).toBe('Taylor is calling you');
  expect((await notifications()).at(-1)?.actions).toEqual(['Answer']);
  await application.evaluate(() => (globalThis as MainGlobal).notificationRecords.at(-1)!.notification.emit('action', { actionIndex: 0 }));
  await expect.poll(() => workshop.evaluate(() => document.body.dataset.answered)).toBe('yes');
  await expect(window.locator('#workspace-title')).toHaveText('Workshop');
  await workshop.getByRole('button', { name: 'End call' }).click();
  await expect(window.getByRole('button', { name: /^Workshop, Workspace loaded/ })).toBeVisible();
  const oldIndex = (await notifications()).length - 1;
  await workshop.evaluate(() => { delete document.body.dataset.answered; document.getElementById('ring')!.click(); });
  await expect.poll(async () => (await notifications()).length).toBeGreaterThan(oldIndex + 1);
  await application.evaluate((_electron, index) => (globalThis as MainGlobal).notificationRecords[index]!.notification.emit('action', { actionIndex: 0 }), oldIndex);
  expect(await workshop.evaluate(() => document.body.dataset.answered)).toBeUndefined();
});

test('ambiguous answer controls revoke direct answering', async () => {
  const workspace = await add('Studio');
  await workspace.getByRole('button', { name: 'Simulate incoming call' }).click();
  await expect(window.getByRole('button', { name: /^Studio, Incoming call/ })).toBeVisible();
  await workspace.getByRole('button', { name: 'Add ambiguous control' }).click();
  await expect(window.getByRole('button', { name: /^Studio, Workspace loaded/ })).toBeVisible();
});

test('saved workspace profiles survive a clean application restart', async () => {
  const studio = await add('Studio');
  await studio.evaluate(() => {
    localStorage.setItem('identity', 'studio');
    document.cookie = 'identity=studio; Secure; SameSite=Strict; Max-Age=86400';
  });
  const workshop = await add('Workshop');
  await workshop.evaluate(() => {
    localStorage.setItem('identity', 'workshop');
    document.cookie = 'identity=workshop; Secure; SameSite=Strict; Max-Age=86400';
  });
  const before = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  await application.close();
  await launch(dataDirectory, true);
  await expect(window.locator('#workspace-title')).toHaveText('Workshop');
  const after = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  expect(after).toEqual(before);
  const stored = await application.evaluate(async ({ session }, ids: string[]) => Promise.all(ids.map(async id => {
    const profile = session.fromPartition(`persist:workspace-${id}`);
    return (await profile.cookies.get({ url: 'https://my.quo.com', name: 'identity' }))[0]?.value;
  })), before.accounts.map((account: { id: string }) => account.id));
  expect(stored).toEqual(['studio', 'workshop']);
  await expect.poll(async () => {
    const pages = application.context().pages().filter(page => page.url().startsWith('https://my.quo.com'));
    return (await Promise.all(pages.map(page => page.evaluate(() => localStorage.getItem('identity'))))).sort();
  }).toEqual(['studio', 'workshop']);
});

test('a detected active call blocks answering in a second workspace', async () => {
  const studio = await addNative('Studio');
  const workshop = await addNative('Workshop');
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await window.locator('#settings').click();
  await window.getByRole('switch', { name: /Answer from notifications/ }).check();
  await window.getByRole('button', { name: 'Save settings' }).click();
  await studio.evaluate(() => {
    document.getElementById('ring')!.click();
    (document.querySelector('[aria-label="Answer call"]') as HTMLElement).click();
  });
  await expect(window.getByRole('button', { name: /^Studio, On a call/ })).toBeVisible();
  await workshop.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await notifications()).at(-1)?.title).toBe('Workshop');
  await application.evaluate(() => (globalThis as MainGlobal).notificationRecords.at(-1)!.notification.emit('action', { actionIndex: 0 }));
  await expect(window.locator('#workspace-title')).toHaveText('Workshop');
  expect(await workshop.evaluate(() => document.body.dataset.answered)).toBeUndefined();
  expect(await studio.evaluate(() => document.body.dataset.answered)).toBe('yes');
});

for (const connection of ['email', 'Username-Password-Authentication']) {
  test(`${connection} sign-in retains its workspace and authentication transaction`, async () => {
    const studio = await add('Studio');
    await studio.evaluate(() => sessionStorage.setItem('auth-transaction-fixture', 'studio'));
    const workshop = await add('Workshop');
    await workshop.evaluate(() => sessionStorage.setItem('auth-transaction-fixture', 'workshop'));
    await window.getByRole('button', { name: /^Studio,/ }).click();
    await studio.evaluate(connection => { location.href = `https://signin.openphone.com/authorize?connection=${connection}`; }, connection);
    await expect(studio.getByRole('heading', { name: 'Quo sign-in fixture' })).toBeVisible();
    expect(await application.evaluate(() => (globalThis as MainGlobal).externalOrigins)).toEqual([]);
    expect(await studio.evaluate(() => sessionStorage.getItem('auth-transaction-fixture'))).toBeNull();
    expect(await studio.evaluate(() => typeof (window as unknown as Record<string, unknown>).switchboard)).toBe('undefined');
    // The auth provider must retain its own untouched browser Notification API.
    expect(await studio.evaluate(() => Notification.name)).toBe('Notification');
    await studio.getByRole('link', { name: 'Complete sign-in' }).click();
    await expect(studio.getByRole('heading', { name: 'Quo test workspace' })).toBeVisible();
    expect(await studio.evaluate(() => sessionStorage.getItem('auth-transaction-fixture'))).toBe('studio');
    expect(await workshop.evaluate(() => sessionStorage.getItem('auth-transaction-fixture'))).toBe('workshop');
    await expect(window.locator('#workspace-title')).toHaveText('Studio');
  });
}

test('opening an external page does not hide or reset an active workspace', async () => {
  const studio = await add('Studio');
  await studio.getByRole('button', { name: 'Simulate incoming call' }).click();
  await studio.getByRole('button', { name: 'Answer call' }).click();
  await expect(window.getByRole('button', { name: /^Studio, On a call/ })).toBeVisible();
  await studio.evaluate(() => { location.href = 'https://example.com/help'; });
  await expect.poll(() => application.evaluate(() => (globalThis as MainGlobal).externalOrigins)).toEqual(['https://example.com']);
  await expect(window.getByRole('button', { name: /^Studio, On a call/ })).toBeVisible();
  // Playwright waits for a navigation commit that Electron deliberately canceled.
  // Inspect the retained native view and live document instead.
  const retained = await application.evaluate(async ({ BrowserWindow, WebContentsView }) => {
    const view = BrowserWindow.getAllWindows()[0]!.contentView.children.find(view => view instanceof WebContentsView && view.webContents.getURL().startsWith('https://my.quo.com')) as Electron.WebContentsView;
    return { visible: view.getVisible(), url: view.webContents.getURL(), hasCall: await view.webContents.executeJavaScript('!!document.querySelector("[aria-label=\\\"End call\\\"]")') };
  });
  expect(retained).toEqual({ visible: true, url: 'https://my.quo.com/', hasCall: true });
});

test('a crashed workspace recovers without losing its persistent profile or reloading its neighbor', async () => {
  const studio = await add('Studio');
  await studio.evaluate(() => localStorage.setItem('recovery-marker', 'preserved'));
  const workshop = await add('Workshop');
  await workshop.evaluate(() => { document.body.dataset.retained = 'yes'; });
  await application.evaluate(({ webContents }) => {
    webContents.getAllWebContents().filter(contents => contents.getURL().startsWith('https://my.quo.com')).sort((a, b) => a.id - b.id)[0]!.forcefullyCrashRenderer();
  });
  await expect(window.getByRole('button', { name: /^Studio, Could not load/ })).toBeVisible();
  await expect(window.getByRole('button', { name: /^Studio, Workspace loaded/ })).toBeVisible({ timeout: 15_000 });
  const stored = await application.evaluate(async ({ webContents }) => {
    const first = webContents.getAllWebContents().filter(contents => contents.getURL().startsWith('https://my.quo.com')).sort((a, b) => a.id - b.id)[0]!;
    return first.executeJavaScript('localStorage.getItem("recovery-marker")');
  });
  expect(stored).toBe('preserved');
  expect(await workshop.evaluate(() => document.body.dataset.retained)).toBe('yes');
});

test('network loss and wake preserve an active call and probe every background workspace', async () => {
  const studio = await add('Studio');
  const workshop = await add('Workshop');
  await studio.evaluate(() => {
    document.getElementById('ring')!.click();
    (document.querySelector('[aria-label="Answer call"]') as HTMLElement).click();
    document.body.dataset.retained = 'yes';
  });
  await expect(window.getByRole('button', { name: /^Studio, On a call/ })).toBeVisible();
  await application.context().setOffline(true);
  await expect(window.getByRole('button', { name: /^Workshop, Offline/ })).toBeVisible();
  await application.context().setOffline(false);
  await application.evaluate(({ powerMonitor, ipcMain }) => {
    const ids = new Set<number>();
    (globalThis as typeof globalThis & { pulseIds: Set<number> }).pulseIds = ids;
    ipcMain.on('account:event', (event, value) => { if (value.type === 'heartbeat') ids.add(event.sender.id); });
    powerMonitor.emit('suspend');
    powerMonitor.emit('resume');
  });
  await expect(window.getByRole('button', { name: /^Workshop, Workspace loaded/ })).toBeVisible();
  await expect.poll(() => application.evaluate(() => (globalThis as typeof globalThis & { pulseIds: Set<number> }).pulseIds.size)).toBe(2);
  expect(await studio.evaluate(() => document.body.dataset.retained)).toBe('yes');
  expect(await studio.getByRole('button', { name: 'End call' }).count()).toBe(1);
  expect(await workshop.getByRole('heading', { name: 'Quo test workspace' }).count()).toBe(1);
});

test('background pages continue heartbeats while the window is closed', async () => {
  await add('Studio');
  await add('Workshop');
  await application.evaluate(({ BrowserWindow, ipcMain }) => {
    const ids = new Set<number>();
    (globalThis as typeof globalThis & { pulseIds: Set<number> }).pulseIds = ids;
    ipcMain.on('account:event', (event, value) => { if (value.type === 'heartbeat') ids.add(event.sender.id); });
    BrowserWindow.getAllWindows()[0]!.close();
  });
  await expect.poll(() => application.evaluate(() => (globalThis as typeof globalThis & { pulseIds: Set<number> }).pulseIds.size), { timeout: 15_000 }).toBe(2);
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);
});

test('cancel, rename, reorder, and removal keep settings and views consistent', async () => {
  const studio = await add('Studio');
  await add('Workshop');
  await window.getByRole('button', { name: /^Add workspace/ }).click();
  await window.getByLabel('Workspace name', { exact: true }).fill('Discarded');
  await window.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(window.getByRole('button', { name: /^Discarded,/ })).toHaveCount(0);
  await window.getByRole('button', { name: 'Edit Studio', exact: true }).click();
  await window.getByLabel('Workspace name', { exact: true }).fill('Renamed Studio');
  await window.getByRole('button', { name: 'Save changes' }).click();
  await expect(window.getByRole('button', { name: /^Renamed Studio,/ })).toBeVisible();
  const before = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  await window.evaluate(id => (window as unknown as { switchboard: { command(value: unknown): Promise<void> } }).switchboard.command({ type: 'move-down', id }), before.accounts[0].id);
  const reordered = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  expect(reordered.accounts.map((a: { name: string }) => a.name)).toEqual(['Workshop', 'Renamed Studio']);
  expect(studio.isClosed()).toBe(false);
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await window.evaluate(id => (window as unknown as { switchboard: { command(value: unknown): Promise<void> } }).switchboard.command({ type: 'remove', id }), before.accounts[0].id);
  expect(JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8')).accounts).toHaveLength(2);
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await window.evaluate(id => (window as unknown as { switchboard: { command(value: unknown): Promise<void> } }).switchboard.command({ type: 'remove', id }), before.accounts[0].id);
  expect(JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8')).accounts.map((a: { name: string }) => a.name)).toEqual(['Workshop']);
  expect(studio.isClosed()).toBe(true);
});

test('the native rail resizes retained views and keeps unread and call routing while collapsed', async () => {
  await application.close();
  await launch(dataDirectory, false, true);
  const command = (value: unknown) => window.evaluate(value => (window as unknown as { switchboard: { command(value: unknown): Promise<void> } }).switchboard.command(value), value);
  const snapshot = () => window.evaluate(() => (window as unknown as { switchboard: { snapshot(): Promise<import('../../src/shared/model').Snapshot> } }).switchboard.snapshot());
  expect((await snapshot()).nativeShell).toBe(true);
  const create = async (name: string): Promise<Page> => {
    const next = application.context().waitForEvent('page');
    await command({ type: 'add', name, color: 'blue' });
    const page = await next;
    await expect(page.getByRole('heading', { name: 'Quo test workspace' })).toBeVisible();
    return page;
  };
  const studio = await create('Studio');
  const workshop = await create('Workshop');
  const before = await snapshot();
  await studio.evaluate(() => { document.title = '(7) Quo fixture'; document.body.dataset.retained = 'yes'; });
  await command({ type: 'toggle-sidebar' });
  await expect.poll(async () => (await snapshot()).accounts[0]?.unread).toBe(7);
  const bounds = await application.evaluate(({ BrowserWindow, WebContentsView }) => BrowserWindow.getAllWindows()[0]!.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.getURL().startsWith('https://my.quo.com')).map(view => view.getBounds()));
  expect(bounds).toHaveLength(2);
  expect(bounds.every(bound => bound.x === 56 && bound.y === 52)).toBe(true);
  await command({ type: 'toggle-sidebar' });
  const resized = await application.evaluate(({ BrowserWindow, WebContentsView }) => {
    const host = BrowserWindow.getAllWindows()[0]!;
    host.setContentSize(860, 580);
    return { size: host.getContentSize(), bounds: host.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.getURL().startsWith('https://my.quo.com')).map(view => view.getBounds()) };
  });
  expect(resized.bounds.every(bound => bound.x === 208 && bound.y === 52 && bound.width === resized.size[0]! - 208 && bound.height === resized.size[1]! - 52)).toBe(true);
  await expect.poll(() => workshop.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: resized.size[0]! - 208, height: resized.size[1]! - 52 });
  await command({ type: 'toggle-sidebar' });
  await studio.evaluate(() => document.getElementById('notify')!.click());
  await expect.poll(async () => (await notifications()).length).toBeGreaterThan(0);
  // A notification also dismisses an unsaved native sheet without creating a workspace.
  await command({ type: 'new-workspace' });
  await application.evaluate(() => (globalThis as MainGlobal).notificationRecords.at(-1)!.notification.emit('click'));
  await expect.poll(async () => (await snapshot()).activeId).toBe(before.accounts[0]!.id);
  await expect.poll(() => studio.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: resized.size[0]! - 56, height: resized.size[1]! - 52 });
  expect((await snapshot()).sidebarCollapsed).toBe(true);
  expect((await snapshot()).accounts[0]!.ringing).toBe(false);
  expect((await snapshot()).accounts).toHaveLength(2);
  expect(await studio.evaluate(() => document.body.dataset.retained)).toBe('yes');
  await studio.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await snapshot()).accounts[0]!.ringing).toBe(true);
  const call = (await snapshot()).accounts[0]!;
  await command({ type: 'call-action', id: call.id, callId: call.callId, action: 'answer' });
  await studio.getByRole('button', { name: 'End call' }).click();
  await expect.poll(async () => { const account = (await snapshot()).accounts[0]!; return account.inCall || account.ringing; }).toBe(false);
  await application.close();
  await launch(dataDirectory, true, true);
  expect((await snapshot()).sidebarCollapsed).toBe(true);
  expect((await snapshot()).accounts.map(account => account.id)).toEqual(before.accounts.map(account => account.id));
});

test('Quo navigation keeps its width across native window sizes and Mac fonts preserve accessibility fonts', async () => {
  await application.close();
  await launch(dataDirectory, false, true, desktopFixture);
  const page = await addNative('Studio');
  for (const width of [860, 1040, 1512]) {
    await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 680), width);
    for (let mode = 0; mode < 2; mode++) {
      await expect.poll(() => page.locator('#sideMenu').evaluate(element => element.getBoundingClientRect().width)).toBe(248);
      await expect(page.getByRole('button', { name: 'Simulate incoming call' })).toBeVisible();
      await shellCommand({ type: 'toggle-sidebar' });
    }
  }
  await expect.poll(() => page.locator('#sideMenu').evaluate(element => getComputedStyle(element).fontFamily)).toContain('-apple-system');
  expect(await page.locator('code').evaluate(element => getComputedStyle(element).fontFamily)).toBe('monospace');
  await shellCommand({ type: 'toggle-appearance' });
  await expect.poll(() => page.locator('#sideMenu').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter');
  expect(await page.locator('#sideMenu').evaluate(element => element.getBoundingClientRect().width)).toBe(248);
  await shellCommand({ type: 'toggle-appearance' });
  await page.evaluate(() => document.body.classList.add('dyslexia'));
  await expect.poll(() => page.locator('#sideMenu').evaluate(element => getComputedStyle(element).fontFamily)).toContain('OpenDyslexic');
  await page.getByRole('button', { name: 'Simulate incoming call' }).click();
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.ringing).toBe(true);
  const call = (await stateSnapshot()).accounts[0]!;
  await shellCommand({ type: 'call-action', id: call.id, callId: call.callId, action: 'answer' });
  await page.getByRole('button', { name: 'End call' }).click();
});

test('workspace zoom is isolated, survives restart, and leaves authentication at actual size', async () => {
  const studio = await add('Studio');
  await add('Workshop');
  const config = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  await shellCommand({ type: 'select', id: config.accounts[0].id });
  await shellCommand({ type: 'zoom-out' });
  const zooms = () => application.evaluate(({ webContents }) => webContents.getAllWebContents().filter(contents => contents.getURL().startsWith('https://my.quo.com')).map(contents => ({ path: contents.session.getStoragePath(), zoom: contents.getZoomFactor(), mode: contents.getZoomMode() })));
  const initial = await zooms();
  expect(initial.find(value => value.path?.includes(config.accounts[0].id))?.zoom).toBeCloseTo(0.9);
  expect(initial.find(value => value.path?.includes(config.accounts[1].id))?.zoom).toBe(1);
  expect(initial.every(value => value.mode === 'isolated')).toBe(true);
  await studio.evaluate(() => { const input = document.createElement('input'); input.type = 'password'; input.autocomplete = 'current-password'; input.id = 'sign-in-fixture'; document.body.append(input); });
  await expect.poll(async () => (await zooms()).find(value => value.path?.includes(config.accounts[0].id))?.zoom).toBe(1);
  await studio.evaluate(() => document.getElementById('sign-in-fixture')!.remove());
  await expect.poll(async () => (await zooms()).find(value => value.path?.includes(config.accounts[0].id))?.zoom).toBeCloseTo(0.9);
  await studio.goto('https://signin.openphone.com/authorize?connection=email');
  await expect(studio.getByRole('heading', { name: 'Quo sign-in fixture' })).toBeVisible();
  const authZoom = await application.evaluate(({ webContents }) => webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://signin.openphone.com'))!.getZoomFactor());
  expect(authZoom).toBe(1);
  await studio.getByRole('link', { name: 'Complete sign-in' }).click();
  await expect(studio.getByRole('heading', { name: 'Quo test workspace' })).toBeVisible();
  // The controlled callback has no Quo router; finish its navigation explicitly.
  await studio.goto('https://my.quo.com/inbox/fixture');
  await expect.poll(async () => (await zooms()).find(value => value.path?.includes(config.accounts[0].id))?.zoom).toBeCloseTo(0.9);
  await application.close();
  await launch(dataDirectory, true);
  await expect.poll(async () => (await zooms()).find(value => value.path?.includes(config.accounts[0].id))?.zoom).toBeCloseTo(0.9);
  await expect.poll(async () => (await zooms()).find(value => value.path?.includes(config.accounts[1].id))?.zoom).toBe(1);
  await shellCommand({ type: 'reset-zoom' });
  await expect.poll(async () => (await zooms()).find(value => value.path?.includes(config.accounts[0].id))?.zoom).toBe(1);
});

test('native text menus bind their commands and frame to the workspace that opened them', async () => {
  await application.close();
  await launch(dataDirectory, false, true, desktopFixture);
  await application.evaluate(({ Menu }) => {
    (globalThis as MainGlobal).textMenus = [];
    Menu.prototype.popup = function (options) { (globalThis as MainGlobal).textMenus.push({ menu: this, frameURL: options?.frame?.url }); };
  });
  const studio = await addNative('Studio');
  await studio.getByRole('textbox', { name: 'Draft' }).fill('Studio draft');
  await studio.getByRole('textbox', { name: 'Draft' }).click({ button: 'right' });
  const record = await application.evaluate(() => {
    const record = (globalThis as MainGlobal).textMenus.at(-1)!;
    return { labels: record.menu.items.map(item => item.label), frameURL: record.frameURL };
  });
  expect(record.labels).toEqual(expect.arrayContaining(['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Paste and Match Style', 'Select All']));
  expect(record.frameURL).toBe('https://my.quo.com/');
  const workshop = await addNative('Workshop');
  await workshop.getByRole('textbox', { name: 'Draft' }).fill('Workshop draft');
  await application.evaluate(({ BrowserWindow }) => {
    const item = (globalThis as MainGlobal).textMenus[0]!.menu.items.find(item => item.label === 'Select All')!;
    item.click(item, BrowserWindow.getAllWindows()[0], { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, triggeredByAccelerator: false });
  });
  expect(await studio.getByRole('textbox', { name: 'Draft' }).evaluate(element => { const field = element as HTMLTextAreaElement; return field.selectionEnd - field.selectionStart; })).toBe('Studio draft'.length);
  expect(await workshop.getByRole('textbox', { name: 'Draft' }).inputValue()).toBe('Workshop draft');
});

test('Quo sidebar badges drive account counts without title double-counting, hover flicker, or stale zeroes', async () => {
  await application.close();
  await launch(dataDirectory, false, true, unreadFixture);
  const studio = await addNative('Studio');
  const workshop = await addNative('Workshop');
  const snapshot = () => window.evaluate(() => (window as unknown as { switchboard: { snapshot(): Promise<{ accounts: { unread: number; unreadKnown: boolean }[] }> } }).switchboard.snapshot());
  await expect.poll(async () => (await snapshot()).accounts.map(account => [account.unread, account.unreadKnown])).toEqual([[22, true], [22, true]]);
  await studio.evaluate(() => {
    document.title = '(999) Quo';
    document.querySelector('#line-one [aria-label]')!.replaceWith(Object.assign(document.createElement('button'), { ariaLabel: 'More menu' }));
  });
  await expect.poll(async () => (await snapshot()).accounts[0]?.unread).toBe(22);
  await workshop.evaluate(() => document.querySelector('[aria-label="11 unread conversations"]')!.setAttribute('aria-label', '13 unread conversations'));
  await expect.poll(async () => (await snapshot()).accounts.map(account => account.unread)).toEqual([22, 24]);
  await studio.evaluate(() => {
    document.querySelectorAll('#sideMenu [aria-label$="unread conversations"]').forEach(element => element.remove());
    document.querySelector('#line-one button')!.remove();
    const direct = document.createElement('span'); direct.setAttribute('aria-label', '2 unread messages');
    document.querySelector('nav[aria-label="Your team"]')!.append(direct);
  });
  await expect.poll(async () => (await snapshot()).accounts[0]?.unread).toBe(2);
  await studio.evaluate(() => document.querySelector('nav[aria-label="Your team"]')!.replaceChildren());
  await expect.poll(async () => (await snapshot()).accounts[0]?.unread).toBe(0);
  expect((await snapshot()).accounts[0]?.unreadKnown).toBe(true);
  await studio.evaluate(() => { document.querySelector('nav[aria-label="Inboxes"]')!.remove(); document.title = '(7) Quo'; });
  await expect.poll(async () => (await snapshot()).accounts[0]?.unread).toBe(7);
  await studio.evaluate(() => { document.title = 'Quo'; });
  await expect.poll(async () => (await snapshot()).accounts[0]).toMatchObject({ unread: 0, unreadKnown: false });
});

test('native activity reports real counts, routes source alerts with the window closed, and preserves preferences', async () => {
  await application.close(); await launch(dataDirectory, false, true, unreadFixture);
  const studio = await addNative('Studio'); const workshop = await addNative('Workshop');
  await shellCommand({type:'preference',key:'menuBarCount',value:true});
  const ids = (await stateSnapshot()).accounts.map(account => account.id);
  const model = () => application.evaluate(() => (globalThis as MainGlobal).nativeStatus);
  const icons = () => application.evaluate(() => (globalThis as MainGlobal).nativeStatusInspect());
  const click = (value: unknown) => application.evaluate((_electron, value) => (globalThis as MainGlobal).nativeStatusAction(JSON.stringify(value)), value);
  await expect.poll(async () => (await model()).items.map(item => item.title)).toEqual(['44']);
  await studio.evaluate(() => document.querySelector('[aria-label="11 unread conversations"]')!.setAttribute('aria-label', '190 unread conversations'));
  await expect.poll(async () => (await model()).items[0]!.title).toBe('99+');
  expect((await model()).accounts[0]!.unread).toBe(201);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await shellCommand({type:'select',id:ids[0]});
  await workshop.getByRole('button', { name: 'Send notification' }).evaluate(element => (element as HTMLElement).click());
  await expect.poll(async () => (await model()).activity.length).toBe(1);
  const activity = (await model()).activity[0]!;
  expect(activity).toMatchObject({ workspaceId: ids[1], title: 'New message', body: 'Fixture message' });
  await click({ type: 'open-activity', id: activity.id });
  await expect.poll(async () => (await stateSnapshot()).activeId).toBe(ids[1]);
  await expect.poll(() => workshop.evaluate(() => document.body.dataset.notificationClicked)).toBe('yes');
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  const preferences = (await stateSnapshot()).preferences;
  await shellCommand({ type: 'preferences', preferences: { ...preferences, privateNotifications: true, menuBarCount: false } });
  expect((await model()).activity[0]).toMatchObject({ title: 'Quo activity', body: 'Open the workspace to view it.' });
  await expect.poll(async () => (await icons())[0]!.title).toBe('');
  await shellCommand({ type: 'preferences', preferences: { ...preferences, menuBarCount: false, showMenuBar: false } });
  expect(await icons()).toEqual([]);
  await shellCommand({ type: 'preferences', preferences: { ...preferences, menuBarCount: false, notifications: false } });
  await application.close(); await launch(dataDirectory, true, true, unreadFixture);
  await expect.poll(async () => (await icons()).length).toBe(1); expect((await icons())[0]!.title).toBe('');
  const restored = await stateSnapshot(); expect(restored.preferences).toMatchObject({ showMenuBar: true, menuBarCount: false, notifications: false });
  expect(restored.accounts.map(account => account.id)).toEqual(ids);
});

const stateSnapshot = () => window.evaluate(() => (window as unknown as { switchboard: { snapshot(): Promise<import('../../src/shared/model').Snapshot> } }).switchboard.snapshot());
const themePrefix = '--fixture-color-';
const themeFixture = unreadFixture.replace('<head>', `<head><style id="verified-contract">
.provider-light { ${QUO_LIGHT.map((value, i) => `${themePrefix}${i.toString(36)}:${value};`).join('')} }
.provider-dark { ${QUO_DARK.map((value, i) => `${themePrefix}${i.toString(36)}:${value};`).join('')} }
body { background:rgb(var(${themePrefix}e)); color:rgb(var(${themePrefix}8)); }
#sideMenu { background:rgb(var(${themePrefix}i)); }
.surface { background:rgb(var(${themePrefix}e)); color:rgb(var(${themePrefix}8)); }
.portal-menu { background:rgb(var(${themePrefix}f)); color:rgb(var(${themePrefix}9)); border:1px solid rgb(var(${themePrefix}b)); }
.accent-link { color:rgb(var(${themePrefix}0)); }
.solid-button { background:rgb(var(${themePrefix}0)); color:rgb(var(${themePrefix}26)); }
.solid-button:hover { background:rgb(var(${themePrefix}1)); }
.solid-button:active { background:rgb(var(${themePrefix}2)); }
.call-surface { background:rgb(var(${themePrefix}28)); color:rgb(var(${themePrefix}26)); }
.semantic-danger { color:rgb(var(${themePrefix}15)); }
.bn-container { --bn-colors-menu-background:#abcdef; }
.editor-menu { background:var(--bn-colors-menu-background); color:var(--bn-colors-menu-text); }
@media(min-width:99999px) { .accent-link { color:red; } }
</style>`).replace('<body>', '<body class="provider-light">')
  .replace('<textarea', '<div class="surface">Conversation</div><a class="accent-link">Compose</a><button class="solid-button">Primary action</button><div class="semantic-danger">Warning</div><div class="call-surface">Call panel</div><div class="bn-container"><div class="editor-menu">Editor menu</div></div><textarea')
  .replace('<div id="call">', '<div id="call" role="dialog" aria-label="Call controls">');

const computed = (page: Page, selector: string, property: 'backgroundColor' | 'color' | 'borderTopColor' = 'backgroundColor') => page.locator(selector).evaluate((element, property) => getComputedStyle(element)[property], property);
const rgb = (hex: string) => `rgb(${channels(hex)})`;

test('workspace themes cover portal and editor menus, separate solid and text accents, and restore on cancellation', async () => {
  await application.close(); await launch(dataDirectory, false, true, themeFixture);
  const studio = await addNative('Studio'); const workshop = await addNative('Workshop');
  const ids = (await stateSnapshot()).accounts.map(account => account.id);
  await shellCommand({ type: 'select', id: ids[0] });
  await studio.evaluate(() => {
    const menu = document.createElement('div'); menu.className = 'provider-light portal-menu'; menu.textContent = 'Portal menu'; document.body.append(menu);
    document.body.dataset.retained = 'yes'; localStorage.setItem('fixture-session', 'retained');
  });
  const original = await computed(studio, '.surface'); const otherOriginal = await computed(workshop, '.surface');
  await shellCommand({ type: 'preview-theme', id: ids[0], theme: { preset: 'iris', mode: 'dark' } });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]?.themeSupport).toBe('compatible');
  let colors = (await stateSnapshot()).appearance!.resolved.colors;
  for (const [selector, property, value] of [['.surface','backgroundColor',colors.surface], ['#sideMenu','backgroundColor',colors.sidebar], ['.portal-menu','backgroundColor',colors.elevated], ['.portal-menu','color',colors.secondary], ['.editor-menu','backgroundColor',colors.elevated], ['.accent-link','color',colors.accentText], ['.solid-button','backgroundColor',colors.accent], ['.solid-button','color',colors.onAccent], ['.call-surface','backgroundColor',colors.callBackground]] as const) {
    await expect.poll(() => computed(studio, selector, property)).toBe(rgb(value));
  }
  await studio.locator('.solid-button').hover();
  await expect.poll(() => computed(studio, '.solid-button')).toBe(rgb(colors.accentHover));
  await studio.mouse.down();
  await expect.poll(() => computed(studio, '.solid-button')).toBe(rgb(colors.accentPressed));
  await studio.mouse.up();
  await studio.locator('.surface').hover();
  expect(await computed(workshop, '.surface')).toBe(otherOriginal);
  expect(await computed(studio, '.semantic-danger', 'color')).toBe(`rgb(${QUO_DARK[parseInt('15',36)]})`);
  expect(await studio.getByRole('textbox', { name: 'Draft' }).inputValue()).toBe('Fixture draft');
  expect(await studio.evaluate(() => localStorage.getItem('fixture-session'))).toBe('retained');
  const persisted = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  expect(persisted.accounts[0].theme).toBeUndefined();
  await shellCommand({ type: 'cancel-theme', id: ids[0] });
  await expect.poll(() => computed(studio, '.surface')).toBe(original);
  await shellCommand({ type: 'save-theme', id: ids[0], theme: { preset: 'pine', mode: 'light' } });
  colors = (await stateSnapshot()).appearance!.resolved.colors;
  await expect.poll(() => computed(studio, '.surface')).toBe(rgb(colors.surface));
  const saved = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  expect(saved.accounts[0].theme).toEqual({ preset: 'pine', mode: 'light' });
  await shellCommand({ type: 'select', id: ids[1] });
  await shellCommand({ type: 'save-theme', id: ids[1], theme: { preset: 'custom', mode: 'dark', accent: '#ffcc00' } });
  await application.close(); await launch(dataDirectory, true, true, themeFixture);
  await expect.poll(async () => (await stateSnapshot()).accounts.map(account => account.themeSupport)).toEqual(['compatible','compatible']);
  expect((await stateSnapshot()).accounts.map(account => account.theme)).toEqual([{ preset:'pine',mode:'light' }, { preset:'custom',mode:'dark',accent:'#ffcc00' }]);
  expect((await stateSnapshot()).accounts.map(account => account.id)).toEqual(ids);
});

test('unrecognized Quo theme contracts fall back cleanly and same-origin authentication stays untouched', async () => {
  await application.close(); await launch(dataDirectory, false, true, themeFixture);
  const page = await addNative('Studio'); const id = (await stateSnapshot()).activeId!;
  const original = await computed(page, '.surface');
  await shellCommand({ type: 'save-theme', id, theme: { preset:'ocean',mode:'dark' } });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]?.themeSupport).toBe('compatible');
  await page.evaluate(prefix => {
    const style = document.querySelector<HTMLStyleElement>('#verified-contract')!;
    style.textContent = style.textContent!.replace(`${prefix}8:31, 31, 32;`, `${prefix}8:30, 30, 30;`);
  }, themePrefix);
  await expect.poll(async () => (await stateSnapshot()).accounts[0]?.themeSupport).toBe('unsupported');
  await expect.poll(() => computed(page, '.surface')).toBe(original);
  await page.reload();
  await expect.poll(async () => (await stateSnapshot()).accounts[0]?.themeSupport).toBe('compatible');
  await page.evaluate(() => { const input=document.createElement('input'); input.autocomplete='current-password'; document.body.append(input); });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]?.themeSupport).toBe('waiting');
  await expect.poll(() => computed(page, '.surface')).toBe(original);
  expect(await page.locator('#sideMenu').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter');
});

test('notification routing cancels an unsaved native theme preview without changing either profile', async () => {
  await application.close(); await launch(dataDirectory, false, true, themeFixture);
  const studio = await addNative('Studio'); const workshop = await addNative('Workshop');
  const ids=(await stateSnapshot()).accounts.map(account=>account.id); const original=await computed(studio,'.surface');
  await shellCommand({type:'workspace-theme',id:ids[0]});
  await shellCommand({type:'preview-theme',id:ids[0],theme:{preset:'ember',mode:'dark'}});
  await expect.poll(async () => (await stateSnapshot()).accounts[0]?.themeSupport).toBe('compatible');
  await workshop.evaluate(()=>document.getElementById('notify')!.click());
  await expect.poll(async () => (await notifications()).length).toBeGreaterThan(0);
  await application.evaluate(() => (globalThis as MainGlobal).notificationRecords.at(-1)!.notification.emit('click'));
  await expect.poll(async () => (await stateSnapshot()).activeId).toBe(ids[1]);
  await expect.poll(() => computed(studio,'.surface')).toBe(original);
  expect((await stateSnapshot()).accounts.every(account=>account.theme===undefined)).toBe(true);
});

test('call status distinguishes hold and mute actions from states and ignores historical status text', async () => {
  await application.close(); await launch(dataDirectory, false, true, themeFixture);
  const page=await addNative('Studio'); const callState=async () => { const account=(await stateSnapshot()).accounts[0]!; return {phase:account.callPhase,muted:account.muted,inCall:account.inCall,ringing:account.ringing}; };
  await page.getByRole('button',{name:'Simulate incoming call'}).click();
  await expect.poll(callState).toEqual({phase:'ringing',muted:false,inCall:false,ringing:true});
  await page.getByRole('button',{name:'Answer call'}).click();
  await page.evaluate(()=>{ document.querySelector('#call')!.insertAdjacentHTML('beforeend','<button aria-label="Hold">Hold</button><button aria-label="Mute">Mute</button>'); document.body.insertAdjacentHTML('beforeend','<span role="status">Reconnecting</span>'); });
  await expect.poll(callState).toEqual({phase:'active',muted:false,inCall:true,ringing:false});
  await page.evaluate(()=>{document.querySelector('[aria-label="Hold"]')!.setAttribute('aria-label','Resume call'); document.querySelector('[aria-label="Mute"]')!.setAttribute('aria-label','Unmute');});
  await expect.poll(callState).toEqual({phase:'held',muted:true,inCall:true,ringing:false});
  for(const [text,phase] of [['Dialing','dialing'],['Connecting','connecting'],['Reconnecting','reconnecting'],['Transferring','transferring'],['Ending call','ending']] as const) {
    await page.evaluate(text=>{document.querySelector('#call [role="status"]')?.remove(); const marker=document.createElement('span');marker.setAttribute('role','status');marker.textContent=text;document.querySelector('#call')!.append(marker);},text);
    await expect.poll(callState).toMatchObject({phase,inCall:true});
    await page.getByRole('button',{name:'End call'}).evaluate(element => element.setAttribute('disabled',''));
    await expect.poll(callState).toMatchObject({phase,inCall:true});
    await page.getByRole('button',{name:'End call'}).evaluate(element => element.removeAttribute('disabled'));
  }
  await page.evaluate(()=>{document.querySelector('#call [role="status"]')!.remove();document.querySelector('#call')!.insertAdjacentHTML('beforeend','<button aria-label="Answer call">Answer waiting call</button>');});
  await expect.poll(callState).toEqual({phase:'held',muted:true,inCall:true,ringing:true});
  await page.evaluate(()=>document.querySelector('#call')!.replaceChildren());
  await expect.poll(callState).toEqual({phase:'idle',muted:false,inCall:false,ringing:false});
});

test('separate menu-bar items keep individual counts and source actions, animate ringing, and clean up on layout changes', async () => {
  await application.close(); await launch(dataDirectory, false, true, themeFixture);
  const studio=await addNative('Studio'); const workshop=await addNative('Workshop');
  const ids=(await stateSnapshot()).accounts.map(account=>account.id);
  const preferencesAtStart = (await stateSnapshot()).preferences;
  await shellCommand({ type: 'preferences', preferences: { ...preferencesAtStart, menuBarLayout: 'separate', menuBarCount:true } });
  const trays = () => application.evaluate(() => {
    const model = (globalThis as MainGlobal).nativeStatus;
    return (globalThis as MainGlobal).nativeStatusInspect().map(item => ({ ...item, name: model.items.find(source => source.id === item.id)!.name, state: model.accounts.find(account => account.id === item.id) }));
  });
  await expect.poll(async () => (await trays()).map(item => [item.name, item.title])).toEqual([['Studio', 'S 22'], ['Workshop', 'W 22']]);
  await shellCommand({ type: 'select', id: ids[0] });
  await workshop.evaluate(()=>document.getElementById('ring')!.click());
  await expect.poll(async()=> (await trays()).find(item=>item.name==='Workshop')!.state?.ringing).toBe(true);
  const frames=new Set<string>(); const still=new Set<string>();
  for(let i=0;i<6;i++){const items=await trays();frames.add(items.find(item=>item.name==='Workshop')!.image);still.add(items.find(item=>item.name==='Studio')!.image);await window.waitForTimeout(240);}
  expect(frames.size).toBe(2);expect(still.size).toBe(1);
  const preferences=(await stateSnapshot()).preferences;
  await shellCommand({type:'preferences',preferences:{...preferences,animateActivity:false}});
  const fixed=(await trays()).find(item=>item.name==='Workshop')!.image;await window.waitForTimeout(750);expect((await trays()).find(item=>item.name==='Workshop')!.image).toBe(fixed);
  await workshop.getByRole('button',{name:'Answer call'}).click();await workshop.getByRole('button',{name:'End call'}).click();
  await shellCommand({type:'preferences',preferences:{...preferences,menuBarLayout:'combined'}});
  await expect.poll(async()=> (await trays()).map(item=>item.title)).toEqual(['44']);
  await shellCommand({type:'preferences',preferences:{...preferences,menuBarCount:false}});
  await expect.poll(async()=> (await trays()).map(item=>[item.name,item.title])).toEqual([['Studio','S'],['Workshop','W']]);
  await shellCommand({type:'preferences',preferences:{...preferences,showMenuBar:false}});expect(await trays()).toEqual([]);
  expect(await studio.evaluate(()=>document.getElementById('sideMenu')!==null)).toBe(true);
});

test('system Reduce Motion stops menu-bar animation and removes page motion without changing the user preference', async () => {
  await application.close(); await launch(dataDirectory,false,true,themeFixture);
  const page=await addNative('Studio');const id=(await stateSnapshot()).activeId!;
  await shellCommand({type:'save-theme',id,theme:{preset:'mac',mode:'light'}});
  await page.getByRole('button',{name:'Simulate incoming call'}).click();
  await expect.poll(async()=> (await stateSnapshot()).accounts[0]?.ringing).toBe(true);
  await application.evaluate(({nativeTheme})=>{(globalThis as MainGlobal).fixtureReduceMotion=true;nativeTheme.emit('updated');});
  await expect.poll(async()=> (await stateSnapshot()).appearance!.reduceMotion).toBe(true);
  await expect.poll(()=>page.locator('.surface').evaluate(element=>getComputedStyle(element).animationDuration)).toBe('1e-05s');
  const icon=()=>application.evaluate(()=>(globalThis as MainGlobal).nativeStatusInspect()[0]!.image);
  const before=await icon();await window.waitForTimeout(750);expect(await icon()).toBe(before);
  expect((await stateSnapshot()).preferences.animateActivity).toBe(true);
  await page.getByRole('button',{name:'Answer call'}).click();await page.getByRole('button',{name:'End call'}).click();
});

test('native call commands revalidate the source call and support mute, hold, resume, and end', async () => {
  await application.close(); await launch(dataDirectory, false, true, themeFixture);
  const studio = await addNative('Studio'); const workshop = await addNative('Workshop');
  const ids = (await stateSnapshot()).accounts.map(account => account.id);
  await studio.evaluate(() => {
    document.querySelector('#call')!.innerHTML = '<div role="dialog" aria-label="Active call"><button aria-label="End call">End</button><button aria-label="Mute">Mute</button><button aria-label="Hold">Hold</button></div>';
    const panel = document.querySelector('#call')!;
    panel.querySelector('[aria-label="End call"]')!.addEventListener('click', () => panel.replaceChildren());
    for (const [action, reverse] of [['Mute', 'Unmute'], ['Hold', 'Resume']]) panel.querySelector(`[aria-label="${action}"]`)!.addEventListener('click', event => {
      const button = event.currentTarget as HTMLElement; button.setAttribute('aria-label', button.getAttribute('aria-label') === action ? reverse! : action!);
    });
  });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.callActions).toEqual(['end', 'mute', 'hold']);
  let callId = (await stateSnapshot()).accounts[0]!.callId!;
  await shellCommand({ type: 'call-action', id: ids[0], callId, action: 'mute' });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.muted).toBe(true);
  await shellCommand({ type: 'call-action', id: ids[0], callId, action: 'hold' });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.callPhase).toBe('held');
  await shellCommand({ type: 'call-action', id: ids[0], callId, action: 'resume' });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.callPhase).toBe('active');
  await workshop.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await stateSnapshot()).accounts[1]!.ringing).toBe(true);
  await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  await shellCommand({ type: 'call-action', id: ids[1], callId: (await stateSnapshot()).accounts[1]!.callId, action: 'answer' });
  expect(await workshop.evaluate(() => document.body.dataset.answered)).toBeUndefined();
  await shellCommand({ type: 'call-action', id: ids[0], callId, action: 'end' });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.inCall).toBe(false);
  callId = (await stateSnapshot()).accounts[1]!.callId!;
  await shellCommand({ type: 'call-action', id: ids[1], callId, action: 'answer' });
  await expect.poll(() => workshop.evaluate(() => document.body.dataset.answered)).toBe('yes');
  expect((await stateSnapshot()).activeId).toBe(ids[1]);
  const activeId = (await stateSnapshot()).accounts[1]!.callId!;
  await shellCommand({ type: 'call-action', id: ids[1], callId, action: 'end' });
  expect((await stateSnapshot()).accounts[1]!.inCall).toBe(true);
  await shellCommand({ type: 'call-action', id: ids[1], callId: activeId, action: 'end' });
  await expect.poll(async () => (await stateSnapshot()).accounts[1]!.inCall).toBe(false);
});

test('global microphone choice resolves per profile, survives restart, and leaves existing streams alone', async () => {
  const studio = await add('Studio'); const workshop = await add('Workshop');
  const inventory = (page: Page) => page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices(); stream.getTracks().forEach(track => track.stop());
    return devices.filter(device => device.kind === 'audioinput' && !['default','communications'].includes(device.deviceId)).map(device => ({ label: device.label, id: device.deviceId }));
  });
  const first = await inventory(studio), second = await inventory(workshop);
  expect(first[1]!.label).toBe(second[1]!.label); expect(first[1]!.id).not.toBe(second[1]!.id);
  await shellCommand({ type: 'audio-preferences', audio: { input: first[1]!.label } });
  await expect.poll(async () => (await stateSnapshot()).accounts.map(account => account.audio?.status)).toEqual(['selected','selected']);
  for (const [page, id] of [[studio, first[1]!.id], [workshop, second[1]!.id]] as const) {
    expect(await page.evaluate(async () => { const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: 'invalid-old-Quo-setting' } } }); const actual = stream.getAudioTracks()[0]!.getSettings().deviceId; stream.getTracks().forEach(track => track.stop()); return actual; })).toBe(id);
  }
  await shellCommand({ type:'audio-test' });
  await expect.poll(async () => (await stateSnapshot()).accounts[1]!.audio?.testing).toBe(true);
  await shellCommand({type:'select',id:(await stateSnapshot()).accounts[0]!.id});
  await expect.poll(async () => (await stateSnapshot()).accounts[1]!.audio?.testing).toBe(false);
  await studio.evaluate(async () => { (window as unknown as { fixtureStream: MediaStream }).fixtureStream = await navigator.mediaDevices.getUserMedia({ audio: true }); });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.audio?.capturing).toBe(true);
  await expect(shellCommand({type:'audio-test'})).rejects.toThrow('Finish the call before testing audio.');
  await shellCommand({ type: 'audio-preferences', audio: { input: 'Unavailable microphone' } });
  expect(await studio.evaluate(() => (window as unknown as { fixtureStream: MediaStream }).fixtureStream.getAudioTracks()[0]!.readyState)).toBe('live');
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.audio?.status).toBe('missing');
  expect(await workshop.evaluate(async () => { try { await navigator.mediaDevices.getUserMedia({ audio: true }); return 'unexpected'; } catch (error) { return (error as DOMException).name; } })).toBe('NotFoundError');
  await studio.evaluate(() => (window as unknown as { fixtureStream: MediaStream }).fixtureStream.getTracks().forEach(track => track.stop()));
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.audio?.capturing).toBe(false);
  await shellCommand({ type: 'audio-preferences', audio: { input: first[1]!.label } });
  await application.close(); await launch(dataDirectory, true);
  expect((await stateSnapshot()).audio).toEqual({ input: first[1]!.label });
  const config = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  expect(config.audio).toEqual({ input: first[1]!.label }); expect(JSON.stringify(config.audio)).not.toContain(first[1]!.id);
});

test('diagnostic calls are labeled simulations, exercise controls, and never modify Quo calls or counts', async () => {
  await application.close(); await launch(dataDirectory, false, true, unreadFixture);
  const page = await addNative('Studio'); const id = (await stateSnapshot()).activeId!;
  const preferences = (await stateSnapshot()).preferences;
  await shellCommand({ type: 'preferences', preferences: { ...preferences, floatingCalls: false } });
  await application.evaluate(({ app }) => app.hide());
  await expect.poll(async () => (await callPanel()).ownsAlerts).toBe(false);
  await shellCommand({ type: 'test-call', id }); const callId = (await stateSnapshot()).testCall!.id;
  expect((await stateSnapshot()).accounts[0]).toMatchObject({ inCall: false, ringing: false, unread: 22 });
  expect((await notifications()).at(-1)?.subtitle).toBe('Test call · local simulation');
  await application.evaluate(() => (globalThis as MainGlobal).notificationRecords.at(-1)!.notification.emit('action', {}, 0));
  await expect.poll(async () => (await stateSnapshot()).testCall!.phase).toBe('active');
  expect((await stateSnapshot()).testCall!.phase).toBe('active');
  await shellCommand({ type: 'test-call-action', callId, action: 'mute' }); expect((await stateSnapshot()).testCall!.muted).toBe(true);
  await shellCommand({ type: 'test-call-action', callId, action: 'hold' }); expect((await stateSnapshot()).testCall!.phase).toBe('held');
  await shellCommand({ type: 'test-call-action', callId, action: 'resume' }); expect((await stateSnapshot()).testCall!.phase).toBe('active');
  await shellCommand({ type: 'test-call-action', callId, action: 'end' }); expect((await stateSnapshot()).testCall).toBeUndefined();
  expect(await page.evaluate(() => document.body.dataset.answered)).toBeUndefined();
});

const updateFixture = fixture.replace('</script>', `
let controlled = !!navigator.serviceWorker.controller;
navigator.serviceWorker.addEventListener('controllerchange', () => { if (controlled) location.reload(); else controlled = true; });
navigator.serviceWorker.register('/sw.js');
</script>`);
const workerSource = (version: string, delay = 0) => `
const version = '${version}';
self.addEventListener('install', event => event.waitUntil(new Promise(resolve => setTimeout(resolve, ${delay}))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => { if (event.data.type === 'SKIP_WAITING') self.skipWaiting(); else if (event.data.type === 'VERSION') event.ports[0].postMessage(version); });
`;
const workerVersion = (page: Page) => page.evaluate(() => new Promise<string>((resolve, reject) => {
  if (!navigator.serviceWorker.controller) { reject(new Error('No controlling worker')); return; }
  const channel = new MessageChannel(); const timer = setTimeout(() => reject(new Error('Worker did not respond')), 2000);
  channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
  navigator.serviceWorker.controller.postMessage({ type: 'VERSION' }, [channel.port2]);
}));
async function updateAccounts(): Promise<{ studio: Page; workshop: Page; worker: string }> {
  await application.close(); const worker = join(dataDirectory, 'sw.js'); await writeFile(worker, workerSource('v1'));
  await launch(dataDirectory, false, true, updateFixture, worker);
  const studio = await addNative('Studio'), workshop = await addNative('Workshop');
  for (const page of [studio, workshop]) await expect.poll(() => workerVersion(page).catch(() => 'pending')).toBe('v1');
  return { studio, workshop, worker };
}

test('one update action checks every profile, activates its waiting worker, reloads both pages, and preserves identities', async () => {
  const { studio, workshop, worker } = await updateAccounts();
  const before = (await stateSnapshot()).accounts.map(account => account.id);
  await studio.evaluate(() => { localStorage.setItem('identity', 'studio'); document.cookie = 'identity=studio; Secure; SameSite=Lax'; });
  await workshop.evaluate(() => { localStorage.setItem('identity', 'workshop'); document.cookie = 'identity=workshop; Secure; SameSite=Lax'; });
  await writeFile(worker, workerSource('v2'));
  await studio.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect.poll(async () => (await stateSnapshot()).webUpdates?.count).toBe(1);
  expect(await workerVersion(workshop)).toBe('v1');
  await shellCommand({ type: 'update-workspaces' });
  for (const [page, identity] of [[studio, 'studio'], [workshop, 'workshop']] as const) {
    await expect.poll(() => workerVersion(page).catch(() => 'pending')).toBe('v2');
    expect(await page.evaluate(() => localStorage.getItem('identity'))).toBe(identity);
    expect(await page.evaluate(() => document.cookie)).toContain(`identity=${identity}`);
  }
  const after = await stateSnapshot(); expect(after.accounts.map(account => account.id)).toEqual(before);
  expect(after.webUpdates).toMatchObject({ count: 0, phase: 'idle', blocked: false }); expect(after.webUpdates?.error).toBeUndefined();
});

test('a call arriving during update checks prevents activation in every workspace until the shared action is retried', async () => {
  const { studio, workshop, worker } = await updateAccounts();
  await writeFile(worker, workerSource('v2', 5000));
  let finished = false;
  const updating = shellCommand({ type: 'update-workspaces' }).then(() => { finished = true; });
  await expect.poll(async () => (await stateSnapshot()).webUpdates?.phase).toBe('checking');
  await workshop.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await stateSnapshot()).webUpdates?.blocked).toBe(true);
  const ringing = (await stateSnapshot()).accounts[1]!;
  await shellCommand({ type: 'call-action', id: ringing.id, callId: ringing.callId, action: 'answer' });
  await expect.poll(async () => (await stateSnapshot()).accounts[1]!.inCall).toBe(true);
  expect(finished).toBe(false);
  expect((await stateSnapshot()).webUpdates?.phase).toBe('checking');
  await updating;
  expect((await stateSnapshot()).webUpdates?.error).toContain('paused');
  for (const page of [studio, workshop]) expect(await workerVersion(page)).toBe('v1');
  await expect(shellCommand({ type: 'update-workspaces' })).rejects.toThrow('Finish calls');
  const active = (await stateSnapshot()).accounts[1]!;
  await shellCommand({ type: 'call-action', id: active.id, callId: active.callId, action: 'end' });
  await expect.poll(async () => (await stateSnapshot()).webUpdates?.blocked).toBe(false);
  await shellCommand({ type: 'update-workspaces' });
  for (const page of [studio, workshop]) await expect.poll(() => workerVersion(page).catch(() => 'pending')).toBe('v2');
  expect((await stateSnapshot()).webUpdates?.error).toBeUndefined();
});

test('a failed update check preserves both controlling workers and a retry completes the shared update', async () => {
  const { studio, workshop, worker } = await updateAccounts();
  await writeFile(worker, workerSource('v2'));
  await studio.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect.poll(async () => (await stateSnapshot()).webUpdates?.count).toBe(1);
  await writeFile(worker, 'This is not valid JavaScript!');
  await shellCommand({ type: 'update-workspaces' });
  expect((await stateSnapshot()).webUpdates?.error).toContain('Could not check every workspace');
  for (const page of [studio, workshop]) expect(await workerVersion(page)).toBe('v1');
  await writeFile(worker, workerSource('v2'));
  await shellCommand({ type: 'update-workspaces' });
  for (const page of [studio, workshop]) await expect.poll(() => workerVersion(page).catch(() => 'pending')).toBe('v2');
  expect((await stateSnapshot()).webUpdates?.error).toBeUndefined();
});


const currentQuoCallFixture = fixture.replace("area.innerHTML = '<button aria-label=\"Answer call\">Answer</button>';", "area.innerHTML = '<section role=\"dialog\" aria-label=\"Incoming call\"><p>Taylor</p><button>Decline</button><button>Accept</button></section>'; area.querySelectorAll('button')[0].onclick = () => { document.body.dataset.declined = 'yes'; area.replaceChildren(); };").replace("area.firstChild.onclick = () =>", "area.querySelectorAll('button')[1].onclick = () =>");
const callPanel = () => application.evaluate(() => (globalThis as CallPanelGlobal).nativeCallsInspect());
const focusMain = async () => {
  await application.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0]!.focus(); });
};
const panelAction = (card: { id: string; callId: string }, action: string) => application.evaluate((_electron, value) => (globalThis as CallPanelGlobal).nativeCallAction(JSON.stringify(value)), { type: 'call-action', ...card, action });

test('the current Quo dialog produces a native call sheet, preserves page geometry, and answers its hidden source', async () => {
  await application.close(); await launch(dataDirectory, false, true, currentQuoCallFixture);
  const studio = await addNative('Studio'); const workshop = await addNative('Workshop');
  const ids = (await stateSnapshot()).accounts.map(account => account.id);
  await focusMain();
  await studio.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await callPanel()).cards.map(card => [card.name, card.actions])).toEqual([['Studio', ['answer', 'decline']]]);
  await expect.poll(async () => (await callPanel()).visible).toBe(true);
  await expect.poll(async () => (await callPanel()).presentation).toBe('sheet');
  expect(await application.evaluate(({ BrowserWindow, WebContentsView }) => BrowserWindow.getAllWindows()[0]!.contentView.children.filter(view => view instanceof WebContentsView && view.webContents.getURL().startsWith('https://my.quo.com')).map(view => view.getBounds().y))).toEqual([52, 52]);
  expect(await callPanel()).toMatchObject({ sheetVisible: true, nonactivating: false });
  expect((await stateSnapshot()).activeId).toBe(ids[1]);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);
  expect((await callPanel()).visible).toBe(true);
  expect((await callPanel()).sheetVisible).toBe(false);
  const stale = (await callPanel()).cards[0]!;
  await panelAction({ id: stale.id, callId: stale.callId }, 'answer');
  await expect.poll(() => studio.evaluate(() => document.body.dataset.answered)).toBe('yes');
  expect(await workshop.evaluate(() => document.body.dataset.answered)).toBeUndefined();
  expect((await stateSnapshot()).activeId).toBe(ids[0]);
  await expect.poll(async () => (await callPanel()).visible).toBe(false);
  expect((await callPanel()).presentation).toBe('none');
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  await studio.getByRole('button', { name: 'End call' }).click();
  await studio.evaluate(() => { delete document.body.dataset.answered; document.getElementById('ring')!.click(); });
  await expect.poll(async () => { const current = (await callPanel()).cards[0]; return !!current && current.callId !== stale.callId; }).toBe(true);
  await application.evaluate(({ dialog }) => { (globalThis as CallPanelGlobal).fixtureCallFailures = 0; dialog.showMessageBox = async () => { (globalThis as CallPanelGlobal).fixtureCallFailures!++; return { response: 0, checkboxChecked: false }; }; });
  await panelAction({ id: stale.id, callId: stale.callId }, 'answer');
  await expect.poll(() => application.evaluate(() => (globalThis as CallPanelGlobal).fixtureCallFailures)).toBe(1);
  expect(await studio.evaluate(() => document.body.dataset.answered)).toBeUndefined();
  const current = (await callPanel()).cards[0]!;
  await panelAction({ id: current.id, callId: current.callId }, 'decline');
  await expect.poll(() => studio.evaluate(() => document.body.dataset.declined)).toBe('yes');
  await expect.poll(async () => (await callPanel()).visible).toBe(false);
});

test('call panels honor privacy, screen lock, preferences, cancellation, and disabled or ambiguous controls', async () => {
  await application.close(); await launch(dataDirectory, false, true, currentQuoCallFixture);
  const page = await addNative('Studio'); await addNative('Workshop');
  await focusMain();
  await page.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await callPanel()).cards[0]?.body).toBe('Taylor is calling you');
  const preferences = (await stateSnapshot()).preferences;
  await shellCommand({ type: 'preferences', preferences: { ...preferences, privateNotifications: true } });
  expect((await callPanel()).cards[0]).not.toHaveProperty('body');
  expect((await callPanel()).cards[0]).not.toHaveProperty('title');
  await application.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
  expect((await callPanel()).visible).toBe(false);
  expect((await callPanel()).sheetVisible).toBe(false);
  await application.evaluate(({ powerMonitor }) => powerMonitor.emit('unlock-screen'));
  expect((await callPanel()).visible).toBe(true);
  await shellCommand({ type: 'preferences', preferences: { ...preferences, floatingCalls: false } });
  await expect.poll(async () => (await callPanel()).presentation).toBe('sheet');
  await shellCommand({ type: 'preferences', preferences: { ...preferences, notifications: false } });
  await expect.poll(async () => (await callPanel()).presentation).toBe('sheet');
  await shellCommand({ type: 'preferences', preferences });
  expect((await callPanel()).visible).toBe(true);
  await page.evaluate(() => document.querySelector('#call button:last-child')!.setAttribute('disabled', ''));
  await expect.poll(async () => (await callPanel()).cards[0]?.actions).toEqual(['decline']);
  await page.evaluate(() => { document.querySelector('#call button:last-child')!.removeAttribute('disabled'); document.querySelector('#call section')!.insertAdjacentHTML('beforeend', '<button>Accept</button>'); });
  await expect.poll(async () => (await callPanel()).visible).toBe(false);
  await page.evaluate(() => document.querySelector('#call')!.replaceChildren());
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.ringing).toBe(false);
});

test('native call cards stay distinct across workspaces, block busy Answer, and recognize current Quo hold labels', async () => {
  await application.close(); await launch(dataDirectory, false, true, currentQuoCallFixture);
  const studio = await addNative('Studio'); const workshop = await addNative('Workshop');
  await studio.evaluate(() => document.getElementById('ring')!.click()); await workshop.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await callPanel()).cards.map(card => card.name)).toEqual(['Studio', 'Workshop']);
  expect((await callPanel()).cards).toHaveLength(2);
  const first = (await callPanel()).cards[0]!; await panelAction({ id: first.id, callId: first.callId }, 'answer');
  await expect.poll(async () => (await callPanel()).cards.map(card => [card.name, card.busy])).toEqual([['Workshop', true]]);
  await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  const second = (await callPanel()).cards[0]!; await panelAction({ id: second.id, callId: second.callId }, 'answer');
  expect(await workshop.evaluate(() => document.body.dataset.answered)).toBeUndefined();
  await studio.evaluate(() => {
    const region = document.querySelector('#call')!; const end = region.querySelector('button')!;
    const dialog = document.createElement('section'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-label', 'Call in progress');
    region.append(dialog); dialog.append(end); dialog.insertAdjacentHTML('beforeend', '<button aria-label="Put call on hold">Hold</button>');
    dialog.querySelector('[aria-label="Put call on hold"]')!.addEventListener('click', event => (event.currentTarget as HTMLElement).setAttribute('aria-label', 'Take call off hold'));
  });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.callActions).toContain('hold');
  const active = (await stateSnapshot()).accounts[0]!;
  await shellCommand({ type: 'call-action', id: active.id, callId: active.callId, action: 'hold' });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.callPhase).toBe('held');
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.callActions).toContain('resume');
  await studio.getByRole('button', { name: 'End call' }).click();
  await expect.poll(async () => (await callPanel()).cards[0]?.busy).toBe(false);
  await panelAction({ id: second.id, callId: second.callId }, 'decline');
  await expect.poll(async () => (await callPanel()).visible).toBe(false);
});

test('standard window commands hide and restore the main window while incoming calls remain actionable', async () => {
  await application.close(); await launch(dataDirectory, false, true, currentQuoCallFixture);
  const studio = await addNative('Studio'); await addNative('Workshop');
  await studio.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await callPanel()).visible).toBe(true);
  const menu = await application.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()!;
    return { close: menu.items.find(item => item.label === 'Workspace')!.submenu!.items.find(item => item.label === 'Close Window')!.accelerator,
      window: menu.items.find(item => item.role?.toLowerCase() === 'windowmenu')!.submenu!.items.filter(item => item.role).map(item => item.role) };
  });
  expect(menu.close).toBe('CommandOrControl+W');
  expect(menu.window).toEqual(['minimize', 'zoom', 'front']);
  await application.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0]!.focus(); });
  await expect.poll(async () => (await callPanel()).presentation).toBe('sheet');
  await application.evaluate(({ Menu }) => { const item = Menu.getApplicationMenu()!.items.find(item => item.label === 'Workspace')!.submenu!.items.find(item => item.label === 'Close Window')!; item.click(); });
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);
  expect((await callPanel()).visible).toBe(true);
  await shellCommand({ type: 'show' });
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  await expect.poll(async () => (await callPanel()).visible).toBe(true);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize());
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(true);
  await shellCommand({ type: 'show' });
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(false);
});


test('system call notifications expose source-bound Decline and suppress alerts for a call already answered', async () => {
  await application.close(); await launch(dataDirectory, false, true, currentQuoCallFixture);
  const studio = await addNative('Studio'); const workshop = await addNative('Workshop');
  const preferences = (await stateSnapshot()).preferences;
  await shellCommand({ type: 'preferences', preferences: { ...preferences, experimentalAnswer: true, floatingCalls: false } });
  await application.evaluate(({ app }) => app.hide());
  await studio.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await notifications()).at(-1)?.body).toBe('Taylor is calling you');
  expect((await notifications()).at(-1)?.actions).toEqual(['Answer', 'Decline']);
  await application.evaluate(() => (globalThis as MainGlobal).notificationRecords.at(-1)!.notification.emit('action', {}, 1));
  await expect.poll(() => studio.evaluate(() => document.body.dataset.declined)).toBe('yes');
  expect(await workshop.evaluate(() => document.body.dataset.declined)).toBeUndefined();
  await expect.poll(async () => (await callPanel()).visible).toBe(false);
  const count = (await notifications()).length;
  await studio.evaluate(() => { document.getElementById('ring')!.click(); (document.querySelector('#call button:last-child') as HTMLElement).click(); });
  await expect.poll(async () => (await stateSnapshot()).accounts[0]!.inCall).toBe(true);
  await window.waitForTimeout(600);
  expect((await notifications()).length).toBe(count);
});

test('native call presentation suppresses duplicate call alerts while ordinary messages remain in Notification Center', async () => {
  await application.close(); await launch(dataDirectory, false, true, currentQuoCallFixture);
  const studio = await addNative('Studio'); const workshop = await addNative('Workshop');
  await focusMain();
  await studio.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await callPanel()).cards[0]?.body).toBe('Taylor is calling you');
  await expect.poll(async () => (await callPanel()).presentation).toBe('sheet');
  expect(await notifications()).toHaveLength(0);
  await workshop.evaluate(() => document.getElementById('notify')!.click());
  await expect.poll(async () => (await notifications()).map(item => item.body)).toEqual(['Fixture message']);
  await application.evaluate(({ app }) => app.hide());
  await expect.poll(async () => (await callPanel()).presentation).toBe('panel');
  expect(await callPanel()).toMatchObject({ nonactivating: true, key: false });
  await focusMain();
  await expect.poll(async () => (await callPanel()).presentation).toBe('sheet');
  expect(await notifications()).toHaveLength(1);
});
