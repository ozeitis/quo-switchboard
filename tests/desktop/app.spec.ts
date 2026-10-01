import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Notification as NativeNotification } from 'electron';

interface NativeRecord { notification: NativeNotification; title: string; body: string; subtitle: string; actions: string[] }
type MainGlobal = typeof globalThis & { notificationRecords: NativeRecord[]; externalOrigins: string[] };

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

let application: ElectronApplication;
let window: Page;
let dataDirectory: string;

async function launch(directory: string, restoring = false): Promise<void> {
  application = await _electron.launch({ args: [resolve('.')], env: { ...process.env, SWITCHBOARD_TEST_DATA: directory } });
  window = await application.firstWindow();
  if (!restoring) await expect(window.getByRole('button', { name: 'Add your first workspace' })).toBeVisible();
  await application.evaluate(({ app, Notification, webContents, shell }, html) => {
    (globalThis as MainGlobal).notificationRecords = [];
    (globalThis as MainGlobal).externalOrigins = [];
    shell.openExternal = async url => { (globalThis as MainGlobal).externalOrigins.push(new URL(url).origin); };
    Notification.prototype.show = function () {
      (globalThis as MainGlobal).notificationRecords.push({ notification: this, title: this.title, body: this.body, subtitle: this.subtitle, actions: this.actions.map(action => action.text ?? '') });
      this.emit('show');
    };
    Notification.prototype.close = function () { this.emit('close'); };
    const handled = new Set<Electron.Session>();
    const attach = (contents: Electron.WebContents) => {
      if (!handled.has(contents.session)) {
        handled.add(contents.session);
        contents.session.protocol.handle('https', request => {
          const body = new URL(request.url).origin === 'https://signin.openphone.com'
            ? '<!doctype html><h1>Quo sign-in fixture</h1><a href="https://my.quo.com/auth/authorize?code=fixture">Complete sign-in</a>'
            : html;
          return new Response(body, { headers: { 'Content-Type': 'text/html' } });
        });
      }
    };
    app.on('web-contents-created', (_event, contents) => attach(contents));
    for (const contents of webContents.getAllWebContents()) {
      if (contents.getType() === 'browserView') { attach(contents); contents.reload(); }
    }
  }, fixture);
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
