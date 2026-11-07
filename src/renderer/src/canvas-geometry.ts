import type { Layer } from '../../shared/model'
import { localPoint, panelVertices, validPanel, type Point } from '../../shared/panel-geometry'
import { outlineNodes } from '../../shared/balloon-geometry'

export interface ShapeHandle {
  kind: 'vertex' | 'outline' | 'tip' | 'bend' | 'lobe'
  index: number
  point: Point
  label: string
}
export function shapeHandles(layer: Layer): ShapeHandle[] {
  if (layer.kind === 'panel')
    return panelVertices(layer).map((point, index) => ({
      kind: 'vertex',
      index,
      point,
      label: `格框顶点 ${index + 1}`,
    }))
  if (layer.kind !== 'balloon' || !layer.balloonStyle) return []
  const handles: ShapeHandle[] = []
  if (['oval', 'organic', 'whisper'].includes(layer.balloonStyle)) {
    handles.push(
      ...outlineNodes(layer).map((point, index): ShapeHandle => ({
        kind: 'outline',
        index,
        point,
        label: `轮廓节点 ${index + 1}`,
      })),
    )
  }
  for (const [index, tail] of (layer.tails ?? []).entries()) {
    handles.push(
      { kind: 'tip', index, point: tail.tip, label: `尾尖 ${index + 1}` },
      { kind: 'bend', index, point: tail.bend, label: `尾巴弯曲 ${index + 1}` },
    )
  }
  for (const [index, lobe] of (layer.lobes ?? []).entries())
    handles.push({
      kind: 'lobe',
      index,
      point: [lobe.x + lobe.width / 2, lobe.y + lobe.height / 2],
      label: `连体气泡 ${index + 1}`,
    })
  return handles
}
export function moveShapeHandle(
  layer: Layer,
  handle: ShapeHandle,
  position: Point,
): Partial<Layer> {
  const local = localPoint(layer, position)
  const normalized: Point = [local[0] / layer.width, local[1] / layer.height]
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  if (handle.kind === 'vertex') {
    const vertices = panelVertices(layer).map((point): Point => [...point])
    vertices[handle.index] = normalized.map((v) => clamp(v, 0, 1)) as Point
    if (!validPanel(vertices)) return {}
    return { shape: 'polygon', vertices }
  }
  if (handle.kind === 'outline') {
    const outline = outlineNodes(layer).map((point): Point => [...point])
    // Keep each point in its angular sector to avoid a self-intersecting contour.
    const angle = (handle.index * Math.PI) / 4
    const radius = clamp(
      (normalized[0] - 0.5) * Math.cos(angle) + (normalized[1] - 0.5) * Math.sin(angle),
      0.22,
      0.8,
    )
    outline[handle.index] = [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * radius]
    return { outline }
  }
  if (handle.kind === 'lobe') {
    const lobes = JSON.parse(JSON.stringify(layer.lobes ?? [])) as NonNullable<Layer['lobes']>
    const lobe = lobes[handle.index]
    lobe.x = clamp(normalized[0] - lobe.width / 2, -2, 2)
    lobe.y = clamp(normalized[1] - lobe.height / 2, -2, 2)
    return { lobes }
  }
  const tails = JSON.parse(JSON.stringify(layer.tails ?? [])) as NonNullable<Layer['tails']>
  tails[handle.index][handle.kind] = normalized.map((v) => clamp(v, -4, 5)) as Point
  return { tails }
}
