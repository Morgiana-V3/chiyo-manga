import { contextBridge, ipcRenderer } from 'electron'
import type { ChiyoApi, HostState } from '../shared/model'

const api: ChiyoApi = {
  setEditing: (editing) => ipcRenderer.send('editing:set', editing),
  state: () => ipcRenderer.invoke('state:get'),
  execute: (request) => ipcRenderer.invoke('action:execute', request),
  file: (command) => ipcRenderer.invoke('project:file', command),
  importAssets: (kind, familyId) => ipcRenderer.invoke('assets:import', kind, familyId),
  exportPng: (dataUrl) => ipcRenderer.invoke('page:export', dataUrl),
  proposal: (id, adopt) => ipcRenderer.invoke('proposal:adopt', id, adopt),
  providerStatus: () => ipcRenderer.invoke('provider:status'),
  generate: (input, revision, operationId) =>
    ipcRenderer.invoke('generation:run', input, revision, operationId),
  recoverGeneration: (id) => ipcRenderer.invoke('generation:recover', id),
  onState(listener) {
    const handler = (_event: Electron.IpcRendererEvent, state: HostState) => listener(state)
    ipcRenderer.on('state:changed', handler)
    return () => ipcRenderer.removeListener('state:changed', handler)
  },
}
contextBridge.exposeInMainWorld('chiyo', api)
