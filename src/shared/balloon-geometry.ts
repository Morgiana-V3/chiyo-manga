import polygonClipping, { type Polygon } from 'polygon-clipping'
import type { Layer } from './model'
import type { Point } from './panel-geometry'

export const balloonStyles = {
  oval: '椭圆',
  organic: '手绘',
  thought: '思考',
  shout: '喊叫',
  whisper: '低语',
  caption: '旁白',
} as const
export const defaultTail = (): NonNullable<Layer['tails']>[number] => ({
  tip: [0.82, 1.3],
  bend: [0.62, 0.9],
  width: 0.16,
})
export function outlineNodes(layer: Layer): Point[] {
  return (
    layer.outline ??
    Array.from({ length: 8 }, (_, i): Point => {
      const angle = (i * Math.PI) / 4
      const wobble = layer.balloonStyle === 'organic' ? [1, 0.88, 1, 1.08, 0.96, 1, 1, 0.92][i] : 1
      return [0.5 + Math.cos(angle) * 0.5 * wobble, 0.5 + Math.sin(angle) * 0.5 * wobble]
    })
  )
}
function smooth(nodes: Point[]): Point[] {
  const points: Point[] = []
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[(i + nodes.length - 1) % nodes.length]
    const b = nodes[i]
    const c = nodes[(i + 1) % nodes.length]
    const d = nodes[(i + 2) % nodes.length]
    for (let j = 0; j < 12; j++) {
      const t = j / 12
      const coordinate = (axis: 0 | 1) =>
        0.5 *
        (2 * b[axis] +
          (-a[axis] + c[axis]) * t +
          (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t * t +
          (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t * t * t)
      points.push([coordinate(0), coordinate(1)])
    }
  }
  return points
}
export function balloonBody(layer: Layer): Point[] {
  if (layer.balloonStyle === 'caption')
    return [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
  if (layer.balloonStyle === 'shout' || layer.balloonStyle === 'thought') {
    const shout = layer.balloonStyle === 'shout'
    const count = shout ? 32 : 192
    return Array.from({ length: count }, (_, i): Point => {
      const angle = (i * Math.PI * 2) / count
      let radius = 0.5
      if (shout) radius = i % 2 ? 0.37 : 0.5 + 0.035 * Math.sin(i * 2.1)
      else radius = 0.46 + 0.04 * Math.cos(angle * 12)
      return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * radius]
    })
  }
  return smooth(outlineNodes(layer))
}
function tailPolygon(tail: NonNullable<Layer['tails']>[number]): Point[] {
  const direction = Math.atan2(tail.bend[1] - 0.5, tail.bend[0] - 0.5)
  const center: Point = [0.5 + Math.cos(direction) * 0.25, 0.5 + Math.sin(direction) * 0.25]
  const perpendicular: Point = [
    (-Math.sin(direction) * tail.width) / 2,
    (Math.cos(direction) * tail.width) / 2,
  ]
  const points: Point[] = []
  for (const sign of [1, -1]) {
    for (let i = 0; i <= 20; i++) {
      const t = sign === 1 ? i / 20 : 1 - i / 20
      points.push(
        [0, 1].map(
          (axis) =>
            (1 - t) ** 2 * (center[axis] + perpendicular[axis] * sign) +
            2 * (1 - t) * t * (tail.bend[axis] + perpendicular[axis] * sign * 0.4) +
            t * t * tail.tip[axis],
        ) as Point,
      )
    }
  }
  return points
}
export function balloonPath(layer: Layer, includeTails = true): string {
  const body = balloonBody(layer)
  const shapes: Polygon[] = [[body]]
  for (const lobe of layer.lobes ?? [])
    shapes.push([body.map(([x, y]): Point => [lobe.x + x * lobe.width, lobe.y + y * lobe.height])])
  if (includeTails) {
    for (const tail of layer.tails ?? []) {
      if (layer.balloonStyle === 'thought') {
        for (let i = 1; i <= 3; i++) {
          const t = i / 3
          const radius = 0.045 * (1.3 - t)
          const center: Point = [
            tail.bend[0] * (1 - t) + tail.tip[0] * t,
            tail.bend[1] * (1 - t) + tail.tip[1] * t,
          ]
          shapes.push([
            Array.from({ length: 24 }, (_, j): Point => [
              center[0] + Math.cos((j * Math.PI) / 12) * radius,
              center[1] + Math.sin((j * Math.PI) / 12) * radius,
            ]),
          ])
        }
      } else shapes.push([tailPolygon(tail)])
    }
  }
  const merged = polygonClipping.union(shapes[0], ...shapes.slice(1))
  return merged
    .flatMap((polygon) =>
      polygon.map(
        (ring) =>
          `M ${ring.map(([x, y]) => `${(x * layer.width).toFixed(3)},${(y * layer.height).toFixed(3)}`).join(' L ')} Z`,
      ),
    )
    .join(' ')
}
