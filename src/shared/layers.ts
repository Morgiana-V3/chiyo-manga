import type { Layer } from './model'

export function childrenOf(layers: Layer[], folderId: string | null = null): Layer[] {
  return layers.filter((layer) => (layer.folderId ?? null) === folderId)
}

export function isLayerLocked(layers: Layer[], layer: Layer): boolean {
  if (layer.locked) {
    return true
  }
  const folder = layers.find((entry) => entry.id === layer.folderId)
  return folder ? isLayerLocked(layers, folder) : false
}

export function isLayerVisible(layers: Layer[], layer: Layer): boolean {
  if (!layer.visible) {
    return false
  }
  const folder = layers.find((entry) => entry.id === layer.folderId)
  return folder ? isLayerVisible(layers, folder) : true
}

export function subtreeIds(layers: Layer[], id: string): Set<string> {
  const ids = new Set([id])
  for (const child of childrenOf(layers, id)) {
    for (const childId of subtreeIds(layers, child.id)) {
      ids.add(childId)
    }
  }
  return ids
}

// Storage order is back to front, with each folder immediately before its subtree.
export function orderedLayers(layers: Layer[], folderId: string | null = null): Layer[] {
  return childrenOf(layers, folderId).flatMap((layer) => [
    layer,
    ...orderedLayers(layers, layer.id),
  ])
}

export function moveLayer(
  layers: Layer[],
  id: string,
  targetId: string | null,
  placement: 'above' | 'below' | 'inside',
): Layer[] {
  const layer = layers.find((entry) => entry.id === id)
  const target = layers.find((entry) => entry.id === targetId)
  if (!layer || isLayerLocked(layers, layer)) {
    throw new Error('图层不存在或已被文件夹锁定')
  }
  const movingIds = subtreeIds(layers, id)
  if (targetId && (!target || movingIds.has(targetId))) {
    throw new Error('不能移入自身或子文件夹')
  }
  if (target && isLayerLocked(layers, target)) {
    throw new Error('目标图层或文件夹已锁定')
  }
  if (placement === 'inside' && target && target.kind !== 'group') {
    throw new Error('只能拖入文件夹')
  }
  if (!target && placement !== 'inside') {
    throw new Error('排序目标不存在')
  }
  const ordered = orderedLayers(layers)
  const moving = ordered.filter((entry) => movingIds.has(entry.id))
  const remaining = ordered.filter((entry) => !movingIds.has(entry.id))
  layer.folderId = placement === 'inside' ? targetId : (target?.folderId ?? null)
  let index = remaining.length
  if (target) {
    index = remaining.findIndex((entry) => entry.id === target.id)
    if (placement !== 'below') {
      const targetIds = subtreeIds(remaining, target.id)
      while (index < remaining.length && targetIds.has(remaining[index].id)) {
        index += 1
      }
    }
  }
  remaining.splice(index, 0, ...moving)
  return orderedLayers(remaining)
}
