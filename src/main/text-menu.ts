import { clipboard, Menu, type BrowserWindow, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron';
import { externalURL } from './policy';

export function textMenu(contents: WebContents, params: ContextMenuParams): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const run = (action: () => void) => () => { if (!contents.isDestroyed()) action(); };
  if (params.isEditable && params.misspelledWord) {
    items.push(...params.dictionarySuggestions.slice(0, 5).map(word => ({ label: word, click: run(() => contents.replaceMisspelling(word)) })));
    if (!params.dictionarySuggestions.length) items.push({ label: 'No spelling suggestions', enabled: false });
    items.push({ type: 'separator' });
  }
  if (params.isEditable) {
    items.push(
      { label: 'Undo', enabled: params.editFlags.canUndo, click: run(() => contents.undo()) },
      { label: 'Redo', enabled: params.editFlags.canRedo, click: run(() => contents.redo()) },
      { type: 'separator' },
      { label: 'Cut', enabled: params.editFlags.canCut, click: run(() => contents.cut()) }
    );
  }
  if (params.isEditable || params.selectionText) items.push({ label: 'Copy', enabled: params.editFlags.canCopy, click: run(() => contents.copy()) });
  if (params.isEditable) items.push(
    { label: 'Paste', enabled: params.editFlags.canPaste, click: run(() => contents.paste()) },
    { label: 'Paste and Match Style', enabled: params.editFlags.canPaste, click: run(() => contents.pasteAndMatchStyle()) },
    { type: 'separator' },
    { label: 'Select All', enabled: params.editFlags.canSelectAll, click: run(() => contents.selectAll()) }
  );
  if (externalURL(params.linkURL)) {
    if (items.length) items.push({ type: 'separator' });
    items.push({ label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) });
  }
  return items;
}

export function installTextMenu(contents: WebContents, window: BrowserWindow): void {
  contents.on('context-menu', (_event, params) => {
    const template = textMenu(contents, params);
    if (template.length) Menu.buildFromTemplate(template).popup({ window, frame: params.frame ?? undefined });
  });
}
