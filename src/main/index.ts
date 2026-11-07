import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import sharp from 'sharp'
import { ProjectStore } from './project-store'
import { frontendInput } from './frontend-input'
import { startMcp } from './mcp'
import { createProject, assetKinds } from '../shared/model'
import { GenerationService } from './generation'

app.setName('Chiyo Manga')
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'chiyo-manga-dev'))
  if (process.env.CHIYO_DEBUG_PORT) {
    app.commandLine.appendSwitch('remote-debugging-port', process.env.CHIYO_DEBUG_PORT)
  }
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'chiyo',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])
const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
}
let window: BrowserWindow
let store: ProjectStore
let isClosing = false

async function confirmSave(): Promise<boolean> {
  if (!store.dirty) {
    return true
  }
  const result = await dialog.showMessageBox(window, {
    type: 'question',
    message: '保存当前作品的修改？',
    buttons: ['保存', '取消', '不保存'],
    defaultId: 0,
    cancelId: 1,
  })
  if (result.response === 1) {
    return false
  }
  if (result.response === 0) {
    return await saveProject(false)
  }
  return true
}
async function saveProject(saveAs: boolean): Promise<boolean> {
  let path = store.filePath
  if (saveAs || !path) {
    const result = await dialog.showSaveDialog(window, {
      title: '保存漫画工程',
      defaultPath: `${store.project.name.replace(/[<>:"/\\|?*]/g, '_')}.chiyo`,
      filters: [{ name: 'Chiyo 漫画工程', extensions: ['chiyo'] }],
    })
    if (result.canceled || !result.filePath) {
      return false
    }
    path = result.filePath
  }
  store.save(path)
  return true
}

async function boot(): Promise<void> {
  await app.whenReady()
  const directory = app.getPath('userData')
  const root = app.getAppPath()
  const config = JSON.stringify(
    {
      mcpServers: {
        chiyo: {
          command: 'node',
          args: [
            app.isPackaged
              ? join(process.resourcesPath, 'mcp-bridge.mjs')
              : join(root, 'scripts', 'mcp-bridge.mjs'),
            join(directory, 'bridge.json'),
          ],
        },
      },
    },
    null,
    2,
  )
  store = new ProjectStore(directory, {
    root,
    dataDirectory: directory,
    mode: app.isPackaged ? 'production' : 'development',
    mcpConfig: config,
  })
  const generation = new GenerationService(
    store,
    app.getPath('appData'),
    app.isPackaged
      ? join(app.getPath('desktop'), 'novel-prompt')
      : resolve(root, '../novel-prompt'),
  )
  ipcMain.handle('provider:status', () => generation.status())
  ipcMain.handle('generation:run', async (_event, input, revision, operationId) => {
    await generation.generate(
      input,
      z.number().int().parse(revision),
      z.string().uuid().parse(operationId),
    )
    return store.state()
  })
  ipcMain.handle('generation:recover', async (_event, id) => {
    await generation.recover(z.string().uuid().parse(id))
    return store.state()
  })
  protocol.handle('chiyo', (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== 'asset') {
        return new Response('Not found', { status: 404 })
      }
      const id = z.string().uuid().parse(url.pathname.slice(1))
      return net.fetch(pathToFileURL(store.assetPath(id)).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  window = new BrowserWindow({
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(root, 'build/icon.ico'),
    width: 1480,
    height: 980,
    minWidth: 1060,
    minHeight: 720,
    backgroundColor: '#202125',
    title: '千代 · Chiyo Manga',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#25262b', symbolColor: '#c7c7d0', height: 38 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  store.notify = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('state:changed', store.state())
    }
  }
  ipcMain.on('editing:set', (_event, editing) => {
    store.editing = editing === true
  })
  ipcMain.handle('state:get', () => store.state())
  ipcMain.handle('action:execute', (_event, request) => {
    const parsed = z
      .object({
        action: z.unknown(),
        expectedRevision: z.number().int(),
        operationId: z.string().uuid(),
      })
      .parse(request)
    return store.execute(parsed.action, parsed.expectedRevision, parsed.operationId)
  })
  ipcMain.handle('project:file', async (_event, command) => {
    if (store.busy) {
      throw new Error('正在执行方案，请稍候')
    }
    z.enum(['new', 'open', 'save', 'saveAs']).parse(command)
    store.busy = true
    store.notify()
    try {
      if (command === 'save' || command === 'saveAs') {
        await saveProject(command === 'saveAs')
      } else if (await confirmSave()) {
        if (command === 'new') {
          store.replace(createProject())
        } else {
          const result = await dialog.showOpenDialog(window, {
            filters: [{ name: 'Chiyo 漫画工程', extensions: ['chiyo'] }],
            properties: ['openFile'],
          })
          if (!result.canceled) {
            store.open(resolve(result.filePaths[0]))
          }
        }
      }
    } finally {
      store.busy = false
      store.notify()
    }
    return store.state()
  })
  ipcMain.handle('assets:import', async (_event, kind, familyId) => {
    const parsed = z.enum(assetKinds).parse(kind)
    const family = z.string().uuid().optional().parse(familyId)
    if (store.busy) {
      throw new Error('正在执行方案，请稍候')
    }
    store.busy = true
    store.notify()
    try {
      const result = await dialog.showOpenDialog(window, {
        title: '导入参考素材',
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        properties: ['openFile', 'multiSelections'],
      })
      if (!result.canceled) {
        for (const path of result.filePaths) {
          await store.importImage(path, parsed, { familyId: family })
        }
      }
    } finally {
      store.busy = false
      store.notify()
    }
    return store.state()
  })
  ipcMain.handle('page:export', async (_event, dataUrl) => {
    if (store.busy) throw new Error('当前操作尚未结束')
    store.busy = true
    store.notify()
    try {
      const data = z
        .string()
        .max(100 * 1024 * 1024)
        .regex(/^data:image\/png;base64,/)
        .parse(dataUrl)
      const result = await dialog.showSaveDialog(window, {
        title: '导出漫画页',
        defaultPath: `${store.project.name}.png`,
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      })
      if (result.canceled || !result.filePath) {
        return null
      }
      const page = store.project.pages.find((entry) => entry.id === store.project.activePageId)!
      writeFileSync(
        result.filePath,
        await sharp(Buffer.from(data.split(',')[1], 'base64'))
          .withMetadata({ density: page.dpi })
          .png()
          .toBuffer(),
      )
      store.log('导出', `已导出 ${result.filePath}`)
      store.persist()
      return result.filePath
    } finally {
      store.busy = false
      store.notify()
    }
  })
  ipcMain.handle('proposal:adopt', (_event, id, adopt) =>
    store.adopt(z.string().uuid().parse(id), z.boolean().parse(adopt)),
  )
  window.on('close', (event) => {
    if (isClosing) {
      return
    }
    event.preventDefault()
    if (store.busy) {
      void dialog.showMessageBox(window, { message: '当前操作尚未完成，请完成后关闭。' })
      return
    }
    void confirmSave().then((confirmed) => {
      if (confirmed) {
        isClosing = true
        window.close()
      }
    })
  })
  app.on('second-instance', () => {
    window.show()
    window.focus()
  })
  const stop = await startMcp(
    store,
    async () => (await window.webContents.capturePage()).toPNG(),
    () => {
      window.show()
      window.focus()
    },
    generation,
    () => window.webContents.executeJavaScript('window.chiyoRenderPage()'),
    (options) =>
      window.webContents.executeJavaScript(`window.chiyoSetView(${JSON.stringify(options)})`),
    () => {
      if (!store.busy && !store.editing && !store.dirty) window.close()
    },
    frontendInput(window, store),
  )
  app.on('before-quit', stop)
  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
if (hasLock) {
  void boot().catch((error) => {
    dialog.showErrorBox('Chiyo 启动失败', String(error))
    app.exit(1)
  })
}
app.on('window-all-closed', () => app.quit())
