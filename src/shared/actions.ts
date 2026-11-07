import { applyPanelSplit } from './panel-actions'
import { activePage, validateProject, type Project, type Action } from './model'
import { childrenOf, isLayerLocked, moveLayer, orderedLayers, subtreeIds } from './layers'

export function applyAction(input: Project, action: Action): Project {
  const project: Project = structuredClone(input)
  const page = activePage(project)
  if (action.type === 'panel.split') {
    applyPanelSplit(page, action)
    project.selectedId = action.newPanelId
  } else if (action.type === 'layer.paste') {
    if (action.sourceProjectId !== project.id) {
      throw new Error('图层剪贴板属于其他工程，请在当前工程重新复制')
    }
    if (!action.layers.some((layer) => layer.id === action.selectedId)) {
      throw new Error('粘贴的选中对象不在图层集合中')
    }
    for (const layer of action.layers) {
      const folder = page.layers.find((entry) => entry.id === layer.folderId)
      if (folder && isLayerLocked(page.layers, folder)) {
        throw new Error('目标文件夹已锁定')
      }
    }
    page.layers.push(...action.layers)
    project.selectedId = action.selectedId
  } else if (action.type === 'layer.add') {
    const folder = page.layers.find((entry) => entry.id === action.layer.folderId)
    if (folder && isLayerLocked(page.layers, folder)) {
      throw new Error('目标文件夹已锁定')
    }
    page.layers.push(action.layer)
    project.selectedId = action.layer.id
  } else if (action.type === 'layer.update') {
    const layer = page.layers.find((entry) => entry.id === action.id)
    if (!layer) {
      throw new Error('图层不存在')
    }
    if (
      isLayerLocked(page.layers, layer) &&
      Object.keys(action.patch).some((key) => key !== 'locked' && key !== 'visible')
    ) {
      throw new Error('请先解锁图层')
    }
    const parent = page.layers.find((entry) => entry.id === layer.folderId)
    if (parent && isLayerLocked(page.layers, parent)) {
      throw new Error('请先解锁所属文件夹')
    }
    Object.assign(layer, action.patch)
  } else if (action.type === 'layer.remove') {
    const layer = page.layers.find((entry) => entry.id === action.id)
    if (!layer || isLayerLocked(page.layers, layer)) {
      throw new Error('图层不存在或已锁定')
    }
    const removedIds = subtreeIds(page.layers, action.id)
    if (page.layers.some((entry) => removedIds.has(entry.id) && entry.locked)) {
      throw new Error('文件夹包含锁定对象，请先解锁')
    }
    page.layers = page.layers.filter((entry) => !removedIds.has(entry.id))
    for (const child of page.layers) {
      if (child.parentId && removedIds.has(child.parentId)) {
        delete child.parentId
      }
    }
    project.selectedId = null
  } else if (action.type === 'layer.order') {
    const layer = page.layers.find((entry) => entry.id === action.id)
    if (!layer || isLayerLocked(page.layers, layer)) {
      throw new Error('图层不存在或已锁定')
    }
    const siblings = childrenOf(page.layers, layer.folderId ?? null)
    const index = siblings.findIndex((entry) => entry.id === action.id)
    const target = siblings[index + (action.direction === 'up' ? 1 : -1)]
    if (target) {
      page.layers = moveLayer(
        page.layers,
        layer.id,
        target.id,
        action.direction === 'up' ? 'above' : 'below',
      )
    }
  } else if (action.type === 'layer.move') {
    page.layers = moveLayer(page.layers, action.id, action.targetId, action.placement)
  } else if (action.type === 'layer.ungroup') {
    const group = page.layers.find((entry) => entry.id === action.id && entry.kind === 'group')
    if (!group || isLayerLocked(page.layers, group)) {
      throw new Error('文件夹不存在或已锁定')
    }
    page.layers = orderedLayers(page.layers)
    for (const child of childrenOf(page.layers, group.id)) {
      child.folderId = group.folderId ?? null
      child.visible = group.visible && child.visible
      child.opacity *= group.opacity
    }
    page.layers = page.layers.filter((entry) => entry.id !== group.id)
    project.selectedId = null
  } else if (action.type === 'selection.set') {
    project.selectedId = action.id
  } else if (action.type === 'page.add') {
    project.pages.push(action.page)
    project.activePageId = action.page.id
    project.selectedId = null
  } else if (action.type === 'page.select') {
    project.activePageId = action.id
    project.selectedId = null
  } else if (action.type === 'page.update') {
    Object.assign(page, action.patch)
  } else if (action.type === 'project.rename') {
    project.name = action.name
  } else if (action.type === 'asset.update') {
    const asset = project.assets.find((entry) => entry.id === action.id)
    if (!asset) {
      throw new Error('素材不存在')
    }
    if (action.patch.adopted) {
      for (const sibling of project.assets.filter((entry) => entry.familyId === asset.familyId)) {
        sibling.adopted = false
      }
    }
    Object.assign(asset, action.patch)
  } else {
    throw new Error('历史操作由宿主管理')
  }
  validateProject(project)
  page.layers = orderedLayers(page.layers)
  project.revision += 1
  project.updatedAt = new Date().toISOString()
  return project
}
