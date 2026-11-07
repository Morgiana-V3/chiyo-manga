import type { Layer } from './model'

export type Point = [number, number]
export function panelVertices(layer: Layer): Point[] {
  if (layer.shape === 'polygon' && layer.vertices) return layer.vertices
  if (layer.shape === 'slant') {
    const inset = Math.min(0.4, 24 / layer.width)
    return [
      [inset, 0],
      [1, 0],
      [1 - inset, 1],
      [0, 1],
    ]
  }
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]
}
export function panelPoints(layer: Layer, offset = false): string {
  return panelVertices(layer)
    .map(
      ([x, y]) =>
        `${x * layer.width + (offset ? layer.x : 0)},${y * layer.height + (offset ? layer.y : 0)}`,
    )
    .join(' ')
}
export function area(points: Point[]): number {
  return (
    Math.abs(
      points.reduce((sum, [x, y], i) => {
        const next = points[(i + 1) % points.length]
        return sum + x * next[1] - y * next[0]
      }, 0),
    ) / 2
  )
}
export function validPanel(points: Point[]): boolean {
  if (points.length < 3 || area(points) < 0.0001) return false
  let sign = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const c = points[(i + 2) % points.length]
    if (a.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return false
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-10) continue
    if (sign && Math.sign(cross) !== sign) return false
    sign = Math.sign(cross)
  }
  // Reject self intersections, including stars whose turns have the same sign.
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue
      const c = points[j]
      const d = points[(j + 1) % points.length]
      const side = (p: Point, q: Point, r: Point) =>
        (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
      if (side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0) return false
    }
  }
  return !!sign
}
export function localPoint(layer: Layer, point: Point): Point {
  const angle = (-layer.rotation * Math.PI) / 180
  const x = point[0] - layer.x - layer.width / 2
  const y = point[1] - layer.y - layer.height / 2
  return [
    x * Math.cos(angle) - y * Math.sin(angle) + layer.width / 2,
    x * Math.sin(angle) + y * Math.cos(angle) + layer.height / 2,
  ]
}
export function splitPanel(layer: Layer, from: Point, to: Point, gap: number): [Point[], Point[]] {
  const a = localPoint(layer, from)
  const b = localPoint(layer, to)
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (length < 8) throw new Error('切线太短，请拖过格框的两条边')
  const nx = -(b[1] - a[1]) / length
  const ny = (b[0] - a[0]) / length
  const polygon: Point[] = panelVertices(layer).map(([x, y]) => [x * layer.width, y * layer.height])
  const clip = (sign: number): Point[] => {
    const distance = (p: Point) => sign * ((p[0] - a[0]) * nx + (p[1] - a[1]) * ny) - gap / 2
    const result: Point[] = []
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]
      const q = polygon[(i + 1) % polygon.length]
      const dp = distance(p)
      const dq = distance(q)
      if (dp >= 0) result.push(p)
      if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
        const t = dp / (dp - dq)
        result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
      }
    }
    const normalized: Point[] = result.map(([x, y]) => [
      Math.max(0, Math.min(1, x / layer.width)),
      Math.max(0, Math.min(1, y / layer.height)),
    ])
    if (!validPanel(normalized) || area(result) < 64)
      throw new Error('切线未穿过格框，或格间距过大')
    return normalized
  }
  return [clip(1), clip(-1)]
}
