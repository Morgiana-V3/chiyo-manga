import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProject, makeLayer, projectSchema, actionSchema } from '../src/shared/model'
import { applyAction } from '../src/shared/actions'
import { splitPanel, area, validPanel, panelVertices } from '../src/shared/panel-geometry'
import { balloonPath, defaultTail } from '../src/shared/balloon-geometry'
import { moveShapeHandle } from '../src/renderer/src/canvas-geometry'
import { canvasDragSchema, viewSchema } from '../src/shared/view'

test('切分保留真实像素格间距，旋转格框使用局部坐标', () => {
  const panel = makeLayer('panel', { x: 0, y: 0, width: 200, height: 100 })
  const pieces = splitPanel(panel, [100, 0], [100, 100], 20)
  assert.ok(Math.abs(pieces.reduce((sum, points) => sum + area(points), 0) - 0.9) < 1e-9)
  assert.deepEqual(splitPanel({ ...panel, rotation: 90 }, [150, 50], [50, 50], 20), pieces)
  assert.throws(() => splitPanel(panel, [-20, 0], [-20, 100], 20), /切线/)
  assert.throws(() => splitPanel(panel, [100, 0], [100, 100], 1000), /切线/)
})
test('分格原子复制裁切内容，保留原坐标和文件夹；锁定与遗漏依赖拒绝', () => {
  const group = makeLayer('group')
  const panel = makeLayer('panel', { x: 0, y: 0, width: 200, height: 100, folderId: group.id })
  const text = makeLayer('text', {
    x: 22,
    y: 33,
    parentId: panel.id,
    folderId: group.id,
    text: '原始内容',
  })
  let project = createProject()
  for (const layer of [group, panel, text])
    project = applyAction(project, { type: 'layer.add', layer })
  const newPanelId = crypto.randomUUID()
  const newChildId = crypto.randomUUID()
  const action = actionSchema.parse({
    type: 'panel.split',
    id: panel.id,
    newPanelId,
    from: [100, 0],
    to: [100, 100],
    gap: 20,
    childIds: { [text.id]: newChildId },
  })
  const result = applyAction(project, action)
  assert.equal(result.revision, project.revision + 1)
  assert.deepEqual(
    result.pages[0].layers.find((entry) => entry.id === newChildId),
    { ...text, id: newChildId, parentId: newPanelId },
  )
  assert.equal(project.pages[0].layers.length, 3)
  assert.equal(result.pages[0].layers.length, 5)
  assert.throws(
    () =>
      applyAction(
        applyAction(project, { type: 'layer.update', id: text.id, patch: { locked: true } }),
        action,
      ),
    /解锁/,
  )
  assert.throws(
    () => applyAction(project, { ...action, childIds: {} } as typeof action),
    /裁切内容/,
  )
})
test('格框拒绝交叉、凹角与退化顶点，拖动不越过对边', () => {
  assert.equal(
    validPanel([
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ]),
    false,
  )
  assert.equal(
    validPanel([
      [0, 0],
      [1, 0],
      [0.4, 0.4],
      [0, 1],
    ]),
    false,
  )
  const panel = makeLayer('panel', { x: 0, y: 0, width: 100, height: 100 })
  assert.deepEqual(
    moveShapeHandle(panel, { kind: 'vertex', index: 0, point: [0, 0], label: '' }, [90, 90]),
    {},
  )
  const patch = moveShapeHandle(
    panel,
    { kind: 'vertex', index: 0, point: [0, 0], label: '' },
    [20, 10],
  )
  assert.equal(patch.shape, 'polygon')
  assert.equal(validPanel(patch.vertices!), true)
})
test('气泡主体与弯尾联合为单轮廓，连体气泡无内部接缝', () => {
  const balloon = makeLayer('balloon', { balloonStyle: 'organic', tails: [defaultTail()] })
  const path = balloonPath(balloon)
  assert.equal((path.match(/M /g) ?? []).length, 1)
  assert.ok(!path.includes('NaN'))
  const joined = balloonPath({
    ...balloon,
    lobes: [{ x: 0.55, y: 0.5, width: 0.9, height: 0.8, text: '连体' }],
  })
  assert.equal((joined.match(/M /g) ?? []).length, 1)
  for (const balloonStyle of ['oval', 'thought', 'shout', 'whisper', 'caption'] as const)
    assert.ok(balloonPath({ ...balloon, balloonStyle }).length > 30)
})
test('旧工程不注入新气泡或格框字段，稀疏属性更新不丢几何', () => {
  let project = applyAction(createProject(), { type: 'layer.add', layer: makeLayer('balloon') })
  assert.deepEqual(projectSchema.parse(project), project)
  assert.equal(project.pages[0].layers[0].balloonStyle, undefined)
  const id = project.pages[0].layers[0].id
  project = applyAction(project, {
    type: 'layer.update',
    id,
    patch: { balloonStyle: 'organic', tails: [defaultTail()] },
  })
  const result = applyAction(
    project,
    actionSchema.parse({ type: 'layer.update', id, patch: { text: '更新对白' } }),
  )
  assert.deepEqual(result.pages[0].layers[0].tails, project.pages[0].layers[0].tails)
  assert.deepEqual(panelVertices(makeLayer('panel')), [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ])
})
test('前台视图和真实拖动契约限制工具、坐标与操作编号', () => {
  assert.deepEqual(viewSchema.parse({ tool: 'knife', rightTab: 'generation', zoom: 0.5 }), {
    tool: 'knife',
    rightTab: 'generation',
    zoom: 0.5,
  })
  assert.throws(() => viewSchema.parse({ tool: 'execute-script' }))
  assert.throws(() =>
    canvasDragSchema.parse({
      from: [NaN, 0],
      to: [0, 0],
      expected_revision: 1,
      operation_id: crypto.randomUUID(),
    }),
  )
})
