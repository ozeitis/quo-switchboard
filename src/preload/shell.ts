import { contextBridge, ipcRenderer } from 'electron';
import type { ShellCommand, Snapshot } from '../shared/model';

contextBridge.exposeInMainWorld('switchboard', {
  snapshot: (): Promise<Snapshot> => ipcRenderer.invoke('shell:snapshot'),
  command: (command: ShellCommand): Promise<void> => ipcRenderer.invoke('shell:command', command),
  subscribe: (callback: (snapshot: Snapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Snapshot) => callback(state);
    ipcRenderer.on('shell:state', listener);
    return () => ipcRenderer.removeListener('shell:state', listener);
  },
  onIntent: (callback: (intent: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, intent: string) => callback(intent);
    ipcRenderer.on('shell:intent', listener);
    return () => ipcRenderer.removeListener('shell:intent', listener);
  }
});
