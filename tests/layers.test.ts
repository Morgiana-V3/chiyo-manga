import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProject, makeLayer, projectSchema } from '../src/shared/model'
import { applyAction } from '../src/shared/actions'
import { isLayerLocked, isLayerVisible } from '../src/shared/layers'

test('图层拖入文件夹不改变坐标和裁切，移出后仍保留内容', () => {
  const folder = makeLayer('group')
  const panel = makeLayer('panel')
  const text = makeLayer('text', { text: '原对白', x: 123, parentId: panel.id })
  let project = createProject()
  for (const layer of [panel, folder, text]) {
    project = applyAction(project, { type: 'layer.add', layer })
  }
  project = applyAction(project, {
    type: 'layer.move',
    id: text.id,
    targetId: folder.id,
    placement: 'inside',
  })
  assert.equal(project.pages[0].layers.find((layer) => layer.id === text.id)?.folderId, folder.id)
  project = applyAction(project, {
    type: 'layer.move',
    id: text.id,
    targetId: null,
    placement: 'inside',
  })
  const result = project.pages[0].layers.find((layer) => layer.id === text.id)!
  assert.equal(result.folderId, null)
  assert.equal(result.parentId, panel.id)
  assert.equal(result.x, 123)
  assert.equal(result.text, '原对白')
})

test('移动文件夹保持子树整体顺序，拒绝循环嵌套', () => {
  const folder = makeLayer('group')
  const nested = makeLayer('group', { folderId: folder.id })
  const text = makeLayer('text', { folderId: nested.id })
  const panel = makeLayer('panel')
  let project = createProject()
  for (const layer of [folder, nested, text, panel]) {
    project = applyAction(project, { type: 'layer.add', layer })
  }
  assert.throws(
    () =>
      applyAction(project, {
        type: 'layer.move',
        id: folder.id,
        targetId: nested.id,
        placement: 'inside',
      }),
    /自身|子文件夹/,
  )
  project = applyAction(project, {
    type: 'layer.move',
    id: folder.id,
    targetId: panel.id,
    placement: 'above',
  })
  assert.deepEqual(
    project.pages[0].layers.map((layer) => layer.id),
    [panel.id, folder.id, nested.id, text.id],
  )
  project = applyAction(project, { type: 'layer.order', id: folder.id, direction: 'down' })
  assert.deepEqual(
    project.pages[0].layers.map((layer) => layer.id),
    [folder.id, nested.id, text.id, panel.id],
  )
})

test('文件夹显隐与锁定传递到子层，子层不能绕过锁定', () => {
  const folder = makeLayer('group')
  const text = makeLayer('text', { folderId: folder.id })
  let project = applyAction(createProject(), { type: 'layer.add', layer: folder })
  project = applyAction(project, { type: 'layer.add', layer: text })
  project = applyAction(project, {
    type: 'layer.update',
    id: folder.id,
    patch: { visible: false, locked: true },
  })
  const layers = project.pages[0].layers
  assert.equal(isLayerVisible(layers, text), false)
  assert.equal(isLayerLocked(layers, text), true)
  assert.throws(
    () => applyAction(project, { type: 'layer.update', id: text.id, patch: { locked: false } }),
    /解锁/,
  )
  assert.throws(
    () =>
      applyAction(project, {
        type: 'layer.move',
        id: text.id,
        targetId: null,
        placement: 'inside',
      }),
    /锁定/,
  )
})

test('解除嵌套分组保留子层位置与顺序，删除文件夹清除子树并解除外部裁切', () => {
  const folder = makeLayer('group')
  const inner = makeLayer('group', { folderId: folder.id })
  const panel = makeLayer('panel', { folderId: inner.id })
  const text = makeLayer('text', { parentId: panel.id })
  let project = createProject()
  for (const layer of [folder, inner, panel, text]) {
    project = applyAction(project, { type: 'layer.add', layer })
  }
  project = applyAction(project, { type: 'layer.ungroup', id: inner.id })
  assert.equal(project.pages[0].layers.find((layer) => layer.id === panel.id)?.folderId, folder.id)
  project = applyAction(project, { type: 'layer.remove', id: folder.id })
  assert.deepEqual(
    project.pages[0].layers.map((layer) => layer.id),
    [text.id],
  )
  assert.equal(project.pages[0].layers[0].parentId, undefined)
})

test('旧工程无 folderId 时仍正常读取', () => {
  const project = createProject()
  project.pages[0].layers.push(makeLayer('panel'))
  const loaded = projectSchema.parse(JSON.parse(JSON.stringify(project)))
  assert.equal(loaded.pages[0].layers[0].folderId, undefined)
  assert.equal(loaded.pages[0].layers[0].kind, 'panel')
})
