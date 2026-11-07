import type { Action, Page } from './model'
import { isLayerLocked } from './layers'
import { splitPanel } from './panel-geometry'

export function applyPanelSplit(
  page: Page,
  action: Extract<Action, { type: 'panel.split' }>,
): void {
  const layer = page.layers.find((entry) => entry.id === action.id && entry.kind === 'panel')
  if (!layer || isLayerLocked(page.layers, layer)) throw new Error('格框不存在或已锁定')
  const children = page.layers.filter((entry) => entry.parentId === layer.id)
  if (children.some((entry) => entry.kind === 'group' || isLayerLocked(page.layers, entry)))
    throw new Error('请先解锁格内内容；带裁切的文件夹暂不支持切分')
  if (
    children.length !== Object.keys(action.childIds).length ||
    children.some((entry) => !action.childIds[entry.id])
  )
    throw new Error('裁切内容已变化，请重新读取页面')
  const [first, second] = splitPanel(layer, action.from, action.to, action.gap)
  const next = {
    ...structuredClone(layer),
    id: action.newPanelId,
    name: `${layer.name} · 分格`,
    shape: 'polygon' as const,
    vertices: second,
  }
  layer.shape = 'polygon'
  layer.vertices = first
  page.layers.splice(page.layers.indexOf(layer) + 1, 0, next)
  // Insert next to each original so relative artwork stacking remains unchanged.
  for (const child of children) {
    page.layers.splice(page.layers.indexOf(child) + 1, 0, {
      ...structuredClone(child),
      id: action.childIds[child.id],
      parentId: next.id,
    })
  }
}
