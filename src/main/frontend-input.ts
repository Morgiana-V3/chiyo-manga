import type { BrowserWindow } from 'electron'
import type { CanvasDrag } from '../shared/view'
import type { ProjectStore } from './project-store'

// Native webContents input reaches the same pointer capture, preview and commit handlers as a mouse.
export function frontendInput(window: BrowserWindow, store: ProjectStore) {
  const receipts = new Map<string, { revision: number; error?: string }>()
  let running = false
  return async (request: CanvasDrag) => {
    if (receipts.has(request.operation_id)) return receipts.get(request.operation_id)
    if (
      running ||
      store.busy ||
      store.editing ||
      store.project.revision !== request.expected_revision
    )
      throw new Error('前台状态已变化或正在编辑，请读取新上下文')
    running = true
    let last: { x: number; y: number } | undefined
    const modifiers: 'shift'[] = request.shift ? ['shift'] : []
    try {
      const points: { x: number; y: number }[] = await window.webContents.executeJavaScript(
        `window.chiyoCanvasPoints(${JSON.stringify([request.from, request.to])})`,
      )
      if (store.busy || store.editing || store.project.revision !== request.expected_revision)
        throw new Error('前台状态已变化，请读取新上下文')
      window.show()
      window.focus()
      last = points[0]
      window.webContents.sendInputEvent({
        type: 'mouseDown',
        ...last,
        button: 'left',
        clickCount: 1,
        modifiers,
      })
      for (let step = 1; step <= 16; step++) {
        await new Promise((resolve) => setTimeout(resolve, request.step_delay_ms))
        last = {
          x: Math.round(points[0].x + ((points[1].x - points[0].x) * step) / 16),
          y: Math.round(points[0].y + ((points[1].y - points[0].y) * step) / 16),
        }
        window.webContents.sendInputEvent({
          type: 'mouseMove',
          ...last,
          modifiers: [...modifiers, 'leftbuttondown'],
        })
      }
      window.webContents.sendInputEvent({
        type: 'mouseUp',
        ...last,
        button: 'left',
        clickCount: 1,
        modifiers,
      })
      last = undefined
      await new Promise((resolve) => setTimeout(resolve, 300))
      const error: string = await window.webContents.executeJavaScript(
        'window.chiyoFrontendError()',
      )
      const receipt = { revision: store.project.revision, ...(error ? { error } : {}) }
      receipts.set(request.operation_id, receipt)
      store.log(
        '外部 Agent',
        `前台拖动 ${request.operation_id}：版本 ${request.expected_revision} → ${receipt.revision}${error ? `，${error}` : ''}`,
      )
      store.notify()
      return receipt
    } catch (error) {
      receipts.set(request.operation_id, { revision: store.project.revision, error: String(error) })
      throw error
    } finally {
      if (last && !window.isDestroyed())
        window.webContents.sendInputEvent({
          type: 'mouseUp',
          ...last,
          button: 'left',
          clickCount: 1,
        })
      running = false
      while (receipts.size > 128) receipts.delete(receipts.keys().next().value!)
    }
  }
}
