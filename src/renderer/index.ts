import { COLORS, type AccountState, type Color, type Preferences, type ShellCommand, type Snapshot } from '../shared/model';
import { SHELL_LAYOUT } from '../shared/layout';

for (const [property, value] of Object.entries({
  '--native-sidebar-width': SHELL_LAYOUT.sidebarWidth,
  '--native-rail-width': SHELL_LAYOUT.railWidth,
  '--native-toolbar-height': SHELL_LAYOUT.toolbarHeight,
  '--native-content-radius': SHELL_LAYOUT.contentRadius
})) document.documentElement.style.setProperty(property, `${value}px`);

declare global {
  interface Window {
    switchboard: {
      snapshot(): Promise<Snapshot>;
      command(command: ShellCommand): Promise<void>;
      subscribe(callback: (state: Snapshot) => void): () => void;
      onIntent(callback: (intent: string) => void): () => void;
    };
  }
}

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const accountDialog = get<HTMLDialogElement>('account-dialog');
const settingsDialog = get<HTMLDialogElement>('settings-dialog');
const accountForm = get<HTMLFormElement>('account-form');
const settingsForm = get<HTMLFormElement>('settings-form');
const rows = new Map<string, HTMLElement>();
let state: Snapshot;
let editing: string | null = null;
let previouslyFocused: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
const statusLabels = { loading: 'Loading…', ready: 'Workspace loaded', 'sign-in': 'Sign-in required', offline: 'Offline', error: 'Could not load' };

function toast(message: string): void {
  get('toast').textContent = message;
  get('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { get('toast').hidden = true; }, 6000);
}

async function run(command: ShellCommand): Promise<void> {
  try { await window.switchboard.command(command); }
  catch { toast('The action could not be completed. Please try again.'); }
}

function render(next: Snapshot): void {
  state = next;
  document.body.classList.toggle('native-shell', !!state.nativeShell);
  document.documentElement.classList.toggle('native-shell', !!state.nativeShell);
  document.body.classList.toggle('sidebar-collapsed', !!state.nativeShell && !!state.sidebarCollapsed);
  const list = get('workspaces');
  for (const [id, row] of rows) if (!state.accounts.some(account => account.id === id)) { row.remove(); rows.delete(id); }
  state.accounts.forEach((account, index) => {
    let row = rows.get(account.id);
    if (!row) {
      row = document.createElement('div');
      row.className = 'workspace-row';
      const button = document.createElement('button');
      button.className = 'workspace';
      button.innerHTML = '<span class="workspace-avatar" aria-hidden="true"></span><span class="workspace-labels"><span class="workspace-name"></span><span class="workspace-meta"></span></span><span class="badge" hidden></span>';
      button.addEventListener('click', () => { void run({ type: 'select', id: account.id }); });
      const edit = document.createElement('button');
      edit.className = 'workspace-edit';
      edit.textContent = '···';
      edit.addEventListener('click', () => openAccount(state.accounts.find(a => a.id === account.id)));
      row.addEventListener('contextmenu', event => { event.preventDefault(); openAccount(state.accounts.find(a => a.id === account.id)); });
      row.append(button, edit);
      rows.set(account.id, row);
    }
    row.classList.toggle('selected', account.id === state.activeId);
    row.classList.toggle('ringing', account.ringing);
    row.dataset.color = account.color;
    const button = row.querySelector<HTMLButtonElement>('.workspace')!;
    button.setAttribute('aria-current', account.id === state.activeId ? 'page' : 'false');
    const status = account.inCall ? 'On a call' : account.ringing ? 'Incoming call' : statusLabels[account.status];
    button.setAttribute('aria-label', `${account.name}, ${status}${account.unread ? `, ${account.unread} unread` : ''}`);
    row.querySelector('.workspace-name')!.textContent = account.name;
    row.querySelector('.workspace-avatar')!.textContent = account.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
    row.querySelector('.workspace-meta')!.textContent = status;
    const badge = row.querySelector<HTMLElement>('.badge')!;
    badge.hidden = account.unread === 0;
    badge.textContent = account.unread > 99 ? '99+' : String(account.unread);
    row.querySelector('.workspace-edit')!.setAttribute('aria-label', `Edit ${account.name}`);
    button.title = index < 9 ? `${account.name} (⌘${index + 1})` : account.name;
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
  });
  const active = state.accounts.find(account => account.id === state.activeId);
  get('workspace-count').textContent = String(state.accounts.length);
  get('workspace-title').textContent = active?.name ?? 'Your workspaces';
  get('workspace-status').textContent = active ? active.inCall ? 'On a call' : active.ringing ? 'Incoming call' : statusLabels[active.status] : 'One place to stay in touch';
  get('welcome').hidden = !!active;
  get('loading').hidden = active?.status !== 'loading';
  get('load-error').hidden = active?.status !== 'error';
  get('reload').hidden = !active;
  get('notification-error').hidden = !state.notificationError;
  get<HTMLButtonElement>('test-notification').disabled = !active || !state.preferences.notifications;
  get('app-version').textContent = `Switchboard ${state.version}`;
  const updates = state.webUpdates;
  const update = get<HTMLButtonElement>('update-workspaces');
  update.hidden = !updates || (!updates.count && updates.phase === 'idle' && !updates.error);
  update.disabled = !!updates && (updates.blocked || updates.phase !== 'idle');
  update.textContent = updates?.phase === 'checking' ? 'Checking updates…' : updates?.phase === 'applying' ? 'Updating workspaces…' : 'Update all workspaces';
  update.title = updates?.blocked ? 'Finish calls and reconnect first.' : updates?.error ?? 'Apply Quo web updates across every signed-in workspace.';
}

async function openDialog(dialog: HTMLDialogElement): Promise<void> {
  previouslyFocused = document.activeElement as HTMLElement;
  if (accountDialog.open) accountDialog.close();
  if (settingsDialog.open) settingsDialog.close();
  await window.switchboard.command({ type: 'overlay', open: true });
  dialog.showModal();
}

function openAccount(account?: AccountState): void {
  if (state.nativeShell && !account) { void run({ type: 'new-workspace' }); return; }
  editing = account?.id ?? null;
  get('account-heading').textContent = editing ? 'Edit workspace' : 'Add a workspace';
  get('save-workspace').textContent = editing ? 'Save changes' : 'Add workspace';
  get('remove-workspace').hidden = !editing;
  get<HTMLInputElement>('account-name').value = account?.name ?? '';
  const color = account?.color ?? COLORS[state.accounts.length % COLORS.length]!;
  accountForm.querySelector<HTMLInputElement>(`input[value="${color}"]`)!.checked = true;
  get('account-error').textContent = '';
  void openDialog(accountDialog).then(() => get('account-name').focus()).catch(() => toast('Could not open workspace settings.'));
}

function openSettings(): void {
  if (state.nativeShell) { void run({ type: 'settings' }); return; }
  for (const [key, value] of Object.entries(state.preferences)) { if (key === 'menuBarLayout') settingsForm.querySelector<HTMLSelectElement>('select[name="menuBarLayout"]')!.value = value as string; else settingsForm.querySelector<HTMLInputElement>(`input[name="${key}"]`)!.checked = value as boolean; };
  get('settings-error').textContent = '';
  void openDialog(settingsDialog).catch(() => toast('Could not open settings.'));
}

for (const color of COLORS) {
  const label = document.createElement('label');
  label.className = 'color-choice';
  label.dataset.color = color;
  const input = document.createElement('input');
  input.type = 'radio'; input.name = 'color'; input.value = color;
  input.setAttribute('aria-label', color[0]!.toUpperCase() + color.slice(1));
  label.append(input); get('colors').append(label);
}

for (const dialog of [accountDialog, settingsDialog]) {
  dialog.querySelectorAll('.dismiss').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => {
    if (!accountDialog.open && !settingsDialog.open) {
      void run({ type: 'overlay', open: false });
      previouslyFocused?.focus();
    }
  });
}

accountForm.addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(accountForm);
  const name = String(form.get('name') ?? '').trim();
  const color = String(form.get('color')) as Color;
  if (!name) { get('account-error').textContent = 'Enter a workspace name.'; return; }
  const command: ShellCommand = editing ? { type: 'rename', id: editing, name, color } : { type: 'add', name, color };
  get<HTMLButtonElement>('save-workspace').disabled = true;
  void window.switchboard.command(command).then(() => accountDialog.close()).catch(() => { get('account-error').textContent = 'Could not save this workspace. Check its name and try again.'; }).finally(() => { get<HTMLButtonElement>('save-workspace').disabled = false; });
});
settingsForm.addEventListener('submit', event => {
  event.preventDefault();
  const preferences = Object.fromEntries(Object.keys(state.preferences).map(key => [key, key === 'menuBarLayout' ? settingsForm.querySelector<HTMLSelectElement>('select[name="menuBarLayout"]')!.value : settingsForm.querySelector<HTMLInputElement>(`input[name="${key}"]`)!.checked])) as unknown as Preferences;
  void window.switchboard.command({ type: 'preferences', preferences }).then(() => settingsDialog.close()).catch(() => { get('settings-error').textContent = 'Could not save your settings. Please try again.'; });
});
get('add').addEventListener('click', () => openAccount());
get('first-workspace').addEventListener('click', () => openAccount());
get('settings').addEventListener('click', openSettings);
for (const id of ['reload', 'retry']) get(id).addEventListener('click', () => { if (state.activeId) void run({ type: 'reload', id: state.activeId }); });
get('update-workspaces').addEventListener('click', () => { void run({ type: 'update-workspaces' }); });
get('test-notification').addEventListener('click', () => { if (state.activeId) void run({ type: 'test-notification', id: state.activeId }); });
get('remove-workspace').addEventListener('click', () => { if (editing) void window.switchboard.command({ type: 'remove', id: editing }).then(() => accountDialog.close()).catch(() => { get('account-error').textContent = 'The workspace could not be removed.'; }); });
get('project').addEventListener('click', () => { void run({ type: 'open-help' }); });
window.switchboard.onIntent(value => {
  if (value === 'add') openAccount();
  else if (value === 'settings') openSettings();
  else if (value === 'close-overlay') { accountDialog.close(); settingsDialog.close(); }
});
window.switchboard.subscribe(render);
void window.switchboard.snapshot().then(render).catch(() => toast('Could not load your workspaces. Restart Switchboard.'));
