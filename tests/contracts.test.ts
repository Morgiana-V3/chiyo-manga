import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProject, makeLayer, actionSchema, projectSchema } from '../src/shared/model'
import { applyAction } from '../src/shared/actions'

test('局部更新不能注入创建默认值，重复解析也保持稀疏补丁', () => {
  const layer = makeLayer('balloon', {
    text: '不要丢失对白',
    opacity: 0.5,
    vertical: true,
    prompt: '保留提示',
  })
  const input = { type: 'layer.update', id: layer.id, patch: { x: 120 } }
  const parsed = actionSchema.parse(actionSchema.parse(input))
  assert.deepEqual(parsed, input)
  const project = applyAction(applyAction(createProject(), { type: 'layer.add', layer }), parsed)
  assert.equal(project.pages[0].layers[0].text, layer.text)
  assert.equal(project.pages[0].layers[0].opacity, 0.5)
  assert.equal(project.pages[0].layers[0].vertical, true)
  const assetUpdate = { type: 'asset.update', id: crypto.randomUUID(), patch: { name: '仅改名' } }
  assert.deepEqual(actionSchema.parse(assetUpdate), assetUpdate)
})

test('锁定对象拒绝几何变更，解锁后允许修改', () => {
  const layer = makeLayer('panel', { locked: true })
  const project = applyAction(createProject(), { type: 'layer.add', layer })
  assert.throws(
    () => applyAction(project, { type: 'layer.update', id: layer.id, patch: { x: 200 } }),
    /解锁/,
  )
  const unlocked = applyAction(project, {
    type: 'layer.update',
    id: layer.id,
    patch: { locked: false },
  })
  assert.equal(
    applyAction(unlocked, { type: 'layer.update', id: layer.id, patch: { x: 200 } }).pages[0]
      .layers[0].x,
    200,
  )
})
test('不存在的图片和参考不能被静默绑定', () => {
  assert.throws(
    () =>
      applyAction(createProject(), {
        type: 'layer.add',
        layer: makeLayer('image', { assetId: crypto.randomUUID() }),
      }),
    /素材不存在/,
  )
})
test('删除格框保留子图层，并解除其裁切关系', () => {
  const panel = makeLayer('panel')
  let project = applyAction(createProject(), { type: 'layer.add', layer: panel })
  project = applyAction(project, {
    type: 'layer.add',
    layer: makeLayer('text', { parentId: panel.id }),
  })
  const result = applyAction(project, { type: 'layer.remove', id: panel.id })
  assert.equal(result.pages[0].layers.length, 1)
  assert.equal(result.pages[0].layers[0].parentId, undefined)
  assert.equal(project.pages[0].layers.length, 2)
})
test('允许显式清除裁切，拒绝非法尺寸和非有限坐标', () => {
  assert.equal(
    actionSchema.parse({ type: 'layer.update', id: crypto.randomUUID(), patch: { parentId: null } })
      .type,
    'layer.update',
  )
  assert.throws(() => makeLayer('panel', { width: -1 }))
  assert.throws(() => makeLayer('panel', { x: Infinity }))
  assert.throws(() => projectSchema.parse({ ...createProject(), schema: 2 }))
})
