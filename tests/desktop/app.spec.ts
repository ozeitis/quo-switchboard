import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Menu as NativeMenu, Notification as NativeNotification, Tray as NativeTray, NativeImage } from 'electron';

interface NativeRecord { notification: NativeNotification; title: string; body: string; subtitle: string; actions: string[] }
type MainGlobal = typeof globalThis & { notificationRecords: NativeRecord[]; externalOrigins: string[]; textMenus: { menu: NativeMenu; frameURL?: string }[]; trayMenus: { menu: NativeMenu; tray: NativeTray }[]; trayImages: WeakMap<NativeTray, NativeImage> };

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

async function launch(directory: string, restoring = false, native = false, html = fixture): Promise<void> {
  const fixturePath = join(directory, 'fixture.html');
  await writeFile(fixturePath, html, { mode: 0o600 });
  application = await _electron.launch({ args: [resolve('tests/desktop/bootstrap.cjs')], env: { ...process.env, SWITCHBOARD_TEST_DATA: directory, SWITCHBOARD_TEST_FIXTURE: fixturePath, SWITCHBOARD_TEST_SHELL: native ? 'native' : 'html' } });
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
    await application.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
    await application.close().catch(() => undefined);
  }
  await rm(dataDirectory, { recursive: true, force: true });
});

async function add(name: string): Promise<Page> {
  const pagePromise = application.context().waitForEvent('page');
  await window.getByRole('button', { name: /^Add workspace/ }).click();
  await window.getByLabel('Workspace name', { exact: true }).fill(name);
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
  const studio = await add('Studio');
  const workshop = await add('Workshop');
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
  await studio.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await notifications()).length).toBeGreaterThan(0);
  // A notification also dismisses an unsaved native sheet without creating a workspace.
  await command({ type: 'new-workspace' });
  await application.evaluate(() => (globalThis as MainGlobal).notificationRecords.at(-1)!.notification.emit('click'));
  await expect.poll(async () => (await snapshot()).activeId).toBe(before.accounts[0]!.id);
  await expect.poll(() => studio.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: resized.size[0]! - 56, height: resized.size[1]! - 52 });
  expect((await snapshot()).sidebarCollapsed).toBe(true);
  expect((await snapshot()).accounts[0]!.ringing).toBe(true);
  expect((await snapshot()).accounts).toHaveLength(2);
  expect(await studio.evaluate(() => document.body.dataset.retained)).toBe('yes');
  await studio.getByRole('button', { name: 'Answer call' }).click();
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
  await expect.poll(async () => (await notifications()).length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Answer call' }).click();
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

test('the native menu bar reports each account, routes calls with the window closed, and preserves display preferences', async () => {
  await application.close();
  await launch(dataDirectory, false, true, unreadFixture);
  const studio = await addNative('Studio');
  const workshop = await addNative('Workshop');
  const config = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  await shellCommand({ type: 'select', id: config.accounts[0].id });
  const menu = () => application.evaluate(() => {
    const record = (globalThis as MainGlobal).trayMenus.at(-1)!;
    return { title: record.tray.getTitle(), image: (globalThis as MainGlobal).trayImages.get(record.tray)!.toDataURL(),
      items: record.menu.items.map(item => ({ id: item.id, label: item.label, sublabel: item.sublabel, type: item.type, checked: item.checked, enabled: item.enabled, iconSize: typeof item.icon === 'object' ? item.icon?.getSize() : undefined })) };
  });
  const click = (id: string) => application.evaluate(({ BrowserWindow }, id) => {
    const item = (globalThis as MainGlobal).trayMenus.at(-1)!.menu.getMenuItemById(id)!;
    item.click(item, BrowserWindow.getAllWindows()[0], { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, triggeredByAccelerator: false });
  }, id);
  await expect.poll(async () => (await menu()).title).toBe('44');
  const initial = await menu();
  expect(initial.items.find(item => item.id === 'summary')?.label).toBe('44 unread');
  expect(initial.items.find(item => item.id === `workspace:${config.accounts[0].id}`)).toMatchObject({ label: 'Studio — 22 unread', sublabel: '', type: 'radio', checked: true, iconSize: { width: 18, height: 18 } });
  await studio.evaluate(() => document.querySelector('[aria-label="11 unread conversations"]')!.setAttribute('aria-label', '190 unread conversations'));
  await expect.poll(async () => (await menu()).title).toBe('99+');
  expect((await menu()).items.find(item => item.id === 'summary')?.label).toBe('223 unread');
  expect((await menu()).items.find(item => item.id === `workspace:${config.accounts[0].id}`)?.label).toBe('Studio — 201 unread');
  await studio.evaluate(() => document.querySelector('[aria-label="190 unread conversations"]')!.setAttribute('aria-label', '11 unread conversations'));
  await expect.poll(async () => (await menu()).title).toBe('44');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await workshop.evaluate(() => document.getElementById('ring')!.click());
  await expect.poll(async () => (await menu()).items.find(item => item.id?.startsWith('workspace:'))?.label).toBe('Workshop — Incoming call');
  expect((await menu()).image).not.toBe(initial.image);
  await click(`workspace:${config.accounts[1].id}`);
  await expect(window.locator('#workspace-title')).toHaveText('Workshop');
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  expect(await workshop.evaluate(() => document.body.dataset.answered)).toBeUndefined();
  await workshop.getByRole('button', { name: 'Answer call' }).click();
  await workshop.getByRole('button', { name: 'End call' }).click();
  await click('test-notification');
  await expect.poll(async () => (await notifications()).at(-1)?.subtitle).toBe('Test notification');
  await workshop.evaluate(() => document.querySelector('nav[aria-label="Inboxes"]')!.remove());
  await expect.poll(async () => (await menu()).title).toBe('22+');
  expect((await menu()).items.find(item => item.id === `workspace:${config.accounts[1].id}`)?.sublabel).toContain('Unread unavailable');
  await workshop.reload();
  await expect.poll(async () => (await menu()).title).toBe('44');
  const preferences = config.preferences;
  await shellCommand({ type: 'preferences', preferences: { ...preferences, menuBarCount: false } });
  expect((await menu()).title).toBe('');
  expect((await menu()).items.find(item => item.id === 'summary')?.label).toBe('44 unread');
  await shellCommand({ type: 'preferences', preferences: { ...preferences, menuBarCount: false, showMenuBar: false } });
  expect(await application.evaluate(() => (globalThis as MainGlobal).trayMenus.at(-1)!.tray.isDestroyed())).toBe(true);
  await shellCommand({ type: 'preferences', preferences: { ...preferences, menuBarCount: false, notifications: false } });
  expect((await menu()).items.find(item => item.id === 'test-notification')?.enabled).toBe(false);
  await application.close();
  await launch(dataDirectory, true, true, unreadFixture);
  await expect.poll(async () => (await menu()).items.find(item => item.id === 'summary')?.label).toBe('44 unread');
  expect((await menu()).title).toBe('');
  const restored = JSON.parse(await readFile(join(dataDirectory, 'workspaces.json'), 'utf8'));
  expect(restored.preferences).toMatchObject({ showMenuBar: true, menuBarCount: false, notifications: false });
  expect(restored.accounts.map((account: { id: string }) => account.id)).toEqual(config.accounts.map((account: { id: string }) => account.id));
});
