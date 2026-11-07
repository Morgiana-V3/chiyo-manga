import { activePage, type Action, type Layer, type Project } from './model'
import { orderedLayers, subtreeIds } from './layers'

export interface LayerCopy {
  projectId: string
  rootId: string
  layers: Layer[]
}

// A detached copy buffer: changing the original later cannot change what was copied.
export function captureLayer(
  project: Project,
  id: string,
  preserveInheritedAppearance = true,
): LayerCopy {
  const page = activePage(project)
  const root = page.layers.find((layer) => layer.id === id)
  if (!root) {
    throw new Error('要复制的图层不存在')
  }
  const included = subtreeIds(page.layers, id)
  let expanded = true
  while (expanded) {
    expanded = false
    for (const layer of page.layers) {
      if (layer.parentId && included.has(layer.parentId) && !included.has(layer.id)) {
        for (const childId of subtreeIds(page.layers, layer.id)) {
          included.add(childId)
        }
        expanded = true
      }
    }
  }
  const layers = structuredClone(page.layers.filter((layer) => included.has(layer.id)))
  for (const layer of layers) {
    if (layer.folderId && !included.has(layer.folderId)) {
      let ancestor = page.layers.find((entry) => entry.id === layer.folderId)
      while (ancestor && preserveInheritedAppearance) {
        layer.visible = layer.visible && ancestor.visible
        layer.opacity *= ancestor.opacity
        ancestor = page.layers.find((entry) => entry.id === ancestor!.folderId)
      }
      layer.folderId = null
    }
  }
  // A clipped image copied alone still needs its exact clipping outline on page B.
  const dependencies = new Map<string, Layer>()
  for (const layer of layers) {
    if (!layer.parentId || included.has(layer.parentId) || dependencies.has(layer.parentId)) {
      continue
    }
    const panel = page.layers.find((entry) => entry.id === layer.parentId)
    if (!panel || panel.kind !== 'panel') {
      throw new Error('原图层的裁切格框不存在')
    }
    dependencies.set(panel.id, {
      ...structuredClone(panel),
      name: `${panel.name.slice(0, 190)} · 裁切参照`,
      folderId: null,
      parentId: null,
      visible: false,
    })
  }
  return {
    projectId: project.id,
    rootId: id,
    layers: orderedLayers([...dependencies.values(), ...layers]),
  }
}

export function createPasteAction(
  copy: LayerCopy,
  folderId: string | null = null,
  duplicate = false,
): Extract<Action, { type: 'layer.paste' }> {
  const ids = new Map(copy.layers.map((layer) => [layer.id, crypto.randomUUID()]))
  const layers = copy.layers.map((source) => {
    const layer = structuredClone(source)
    layer.id = ids.get(source.id)!
    layer.folderId =
      source.folderId && ids.has(source.folderId) ? ids.get(source.folderId)! : folderId
    layer.parentId = source.parentId ? (ids.get(source.parentId) ?? null) : null
    if (duplicate) {
      layer.x += 24
      layer.y += 24
      if (source.id === copy.rootId) {
        layer.name = `${source.name.slice(0, 197)} 副本`
      }
    }
    return layer
  })
  return {
    type: 'layer.paste',
    sourceProjectId: copy.projectId,
    layers,
    selectedId: ids.get(copy.rootId)!,
  }
}
