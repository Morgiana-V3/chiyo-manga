import type { ViewOptions } from '../../shared/view'
import type { ChiyoApi } from '../../shared/model'
declare global {
  interface Window {
    chiyoCanvasPoints: (points: [number, number][]) => { x: number; y: number }[]
    chiyoFrontendError: () => string
    chiyoSetView: (options: ViewOptions) => ViewOptions
    chiyoRenderPage: () => Promise<string>
    chiyo: ChiyoApi
  }
}
