import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject, makeLayer, actionSchema } from '../src/shared/model'
import { applyAction } from '../src/shared/actions'
import { captureLayer, createPasteAction } from '../src/shared/layer-copy'

test('复制冻结内容且不改变工程，跨页粘贴重建目录与裁切编号', () => {
  let project = createProject()
  const group = makeLayer('group')
  const panel = makeLayer('panel', { folderId: group.id })
  const child = makeLayer('balloon', {
    text: '复制时的对白',
    folderId: group.id,
    parentId: panel.id,
  })
  project.pages[0].layers = [group, panel, child]
  const before = structuredClone(project)
  const copy = captureLayer(project, group.id)
  assert.deepEqual(project, before)
  child.text = '复制后修改的对白'
  const destination = { ...project.pages[0], id: crypto.randomUUID(), layers: [] }
  project = applyAction(project, { type: 'page.add', page: destination })
  const action = actionSchema.parse(createPasteAction(copy))
  const result = applyAction(project, action)
  const pasted = result.pages[1].layers
  assert.equal(pasted.length, 3)
  const pastedGroup = pasted.find((layer) => layer.kind === 'group')!
  const pastedPanel = pasted.find((layer) => layer.kind === 'panel')!
  const pastedChild = pasted.find((layer) => layer.kind === 'balloon')!
  assert.equal(pastedChild.text, '复制时的对白')
  assert.equal(pastedPanel.folderId, pastedGroup.id)
  assert.equal(pastedChild.parentId, pastedPanel.id)
  assert.equal(pastedChild.x, child.x)
  assert(pasted.every((layer) => !before.pages[0].layers.some((source) => source.id === layer.id)))
  assert.equal(result.revision, project.revision + 1)
})

test('单独复制裁切内容会带隐藏格框参照，复制格框则带上格内内容', () => {
  const project = createProject()
  const panel = makeLayer('panel', { shape: 'slant', rotation: 12 })
  const child = makeLayer('effect', { parentId: panel.id })
  project.pages[0].layers = [panel, child]
  const copy = captureLayer(project, child.id)
  const dependency = copy.layers.find((layer) => layer.kind === 'panel')!
  assert.equal(copy.layers.length, 2)
  assert.equal(dependency.visible, false)
  assert.equal(dependency.rotation, panel.rotation)
  assert.equal(dependency.shape, 'slant')
  const pasted = createPasteAction(copy)
  assert.equal(
    pasted.layers.find((layer) => layer.kind === 'effect')!.parentId,
    pasted.layers.find((layer) => layer.kind === 'panel')!.id,
  )
  assert.equal(captureLayer(project, panel.id).layers.length, 2)
})

test('粘贴原子拒绝锁定目录、其他工程与重复编号', () => {
  const project = createProject()
  const layer = makeLayer('text')
  const locked = makeLayer('group', { locked: true })
  project.pages[0].layers = [layer, locked]
  const copy = captureLayer(project, layer.id)
  assert.throws(() => applyAction(project, createPasteAction(copy, locked.id)), /锁定/)
  const action = createPasteAction(copy)
  assert.throws(() => applyAction(createProject(), action), /其他工程/)
  const pasted = applyAction(project, action)
  assert.throws(() => applyAction(pasted, action), /重复编号/)
  assert.equal(project.pages[0].layers.length, 2)
})

test('重复粘贴每次新建编号，创建副本才偏移；保留外部祖先透明度与显隐', () => {
  const project = createProject()
  const group = makeLayer('group', { opacity: 0.4, visible: false })
  const child = makeLayer('text', { folderId: group.id, opacity: 0.5 })
  project.pages[0].layers = [group, child]
  const copy = captureLayer(project, child.id)
  assert.equal(copy.layers[0].opacity, 0.2)
  assert.equal(copy.layers[0].visible, false)
  assert.notEqual(createPasteAction(copy).selectedId, createPasteAction(copy).selectedId)
  assert.equal(createPasteAction(copy).layers[0].x, child.x)
  assert.equal(createPasteAction(copy, null, true).layers[0].x, child.x + 24)
  const duplicate = createPasteAction(captureLayer(project, child.id, false), group.id, true)
  assert.equal(duplicate.layers[0].opacity, child.opacity)
})
