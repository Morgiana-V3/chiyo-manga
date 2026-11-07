import type { Layer } from '../../shared/model'

let context: CanvasRenderingContext2D | null
const font = '"Microsoft YaHei", sans-serif'
export function layoutBalloonText(
  layer: Layer,
  width = layer.width,
  height = layer.height,
  text = layer.text,
) {
  context ??= document.createElement('canvas').getContext('2d')
  const inset = layer.balloonStyle === 'caption' ? 0 : 0.15
  const padding = layer.textPadding ?? 14
  const usableWidth = Math.max(1, width * (1 - inset * 2) - padding * 2)
  const usableHeight = Math.max(1, height * (1 - inset * 2) - padding * 2)
  const wrap = (size: number) => {
    if (context) context.font = `${size}px ${font}`
    const max = layer.vertical ? usableHeight : usableWidth
    const measure = (value: string) =>
      layer.vertical ? Array.from(value).length * size : context!.measureText(value).width
    const lines: string[] = []
    for (const paragraph of text.split('\n')) {
      let line = ''
      for (const char of Array.from(paragraph)) {
        if (line && measure(line + char) > max) {
          lines.push(line)
          line = ''
        }
        line += char
      }
      lines.push(line)
    }
    const lineHeight = size * 1.35
    const cross = layer.vertical ? usableWidth : usableHeight
    return {
      lines,
      size,
      lineHeight,
      overflow: lines.length * lineHeight > cross || lines.some((line) => measure(line) > max),
    }
  }
  let result = wrap(layer.fontSize)
  if (layer.autoFit !== false && result.overflow) {
    let low = 8
    let high = Math.floor(layer.fontSize)
    result = wrap(8)
    while (low <= high) {
      const size = Math.floor((low + high) / 2)
      const candidate = wrap(size)
      if (candidate.overflow) high = size - 1
      else {
        result = candidate
        low = size + 1
      }
    }
  }
  return {
    ...result,
    width,
    height,
    left: (width - usableWidth) / 2,
    top: (height - usableHeight) / 2,
    usableWidth,
    usableHeight,
  }
}
