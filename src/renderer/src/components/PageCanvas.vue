<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { makeLayer, type Layer } from '../../../shared/model'
import { page, selected, state, execute, run, notice, error } from '../editor'
import LayerVisual from './LayerVisual.vue'
import PanelClips from './PanelClips.vue'
import LayerArtwork from './LayerArtwork.vue'
import { isLayerLocked, isLayerVisible } from '../../../shared/layers'
import { layerMenu, openMenu, pasteMenuItem } from '../context-menu'
import ShapeHandles from './ShapeHandles.vue'
import { moveShapeHandle, type ShapeHandle } from '../canvas-geometry'
import { splitPanel, type Point } from '../../../shared/panel-geometry'
import { useCanvasViewport } from '../canvas-viewport'

const props = defineProps<{ tool: string; zoom: number; showGuides: boolean; splitGap: number }>()
const emit = defineEmits<{
  'update:zoom': [value: number]
  'update:tool': [value: string]
  'hand-active': [value: boolean]
}>()
const canvas = ref<SVGSVGElement>()
const viewport = ref<HTMLElement>()
const navigation = useCanvasViewport(
  viewport,
  () => props.zoom,
  () => props.tool,
  (value) => emit('update:zoom', value),
)
watch(navigation.hand, (value) => emit('hand-active', value), { immediate: true })
const preview = ref<Layer>()
let moveFrame = 0
let pendingMove: PointerEvent | undefined
function flushMove(): void {
  cancelAnimationFrame(moveFrame)
  moveFrame = 0
  if (pendingMove) applyMove(pendingMove)
  pendingMove = undefined
}
function move(event: PointerEvent): void {
  if (!gesture.value) return
  if (gesture.value.mode === 'draw') {
    applyMove(event)
    return
  }
  pendingMove = event
  if (!moveFrame) moveFrame = requestAnimationFrame(flushMove)
}
function menu(event: MouseEvent): void {
  const id = (event.target as Element).closest('[data-layer]')?.getAttribute('data-layer')
  const layer = page.value?.layers.find((entry) => entry.id === id)
  if (layer) {
    if (selected.value?.id !== layer.id) void execute({ type: 'selection.set', id: layer.id })
    openMenu(event, layerMenu(layer))
  } else {
    openMenu(event, [
      pasteMenuItem(),
      { label: '适合窗口', shortcut: 'Ctrl+0', run: navigation.fit },
      { label: '实际大小 · 100%', shortcut: 'Ctrl+1', run: () => navigation.setZoom(1) },
      { label: '抓手工具', shortcut: 'H', run: () => emit('update:tool', 'hand') },
      { label: '选择工具', shortcut: 'V', run: () => emit('update:tool', 'select') },
    ])
  }
}
const gesture = ref<{
  mode: string
  startX: number
  startY: number
  layer: Layer
  revision: number
  handle?: ShapeHandle
  end?: Point
}>()
const layers = computed(
  () =>
    page.value?.layers.map((layer) => (preview.value?.id === layer.id ? preview.value : layer)) ??
    [],
)
const selection = computed(() => preview.value ?? selected.value)
const panels = computed(() => layers.value.filter((layer) => layer.kind === 'panel'))
const svgWidth = computed(() => (page.value?.width ?? 1200) * props.zoom)
const svgHeight = computed(() => (page.value?.height ?? 1800) * props.zoom)
function point(event: PointerEvent): DOMPoint {
  const matrix = canvas.value?.getScreenCTM()
  if (!matrix) {
    return new DOMPoint()
  }
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
}
function down(event: PointerEvent, layer?: Layer, resize = false): void {
  if (event.button !== 0 || state.value?.busy || !canvas.value || !page.value) {
    return
  }
  event.stopPropagation()
  const location = point(event)
  canvas.value.setPointerCapture(event.pointerId)
  window.chiyo.setEditing(true)
  if (props.tool === 'pen' || props.tool === 'white') {
    const stroke = makeLayer('stroke', {
      x: 0,
      y: 0,
      width: page.value.width,
      height: page.value.height,
      stroke: props.tool === 'white' ? '#ffffff' : '#171717',
      strokeWidth: props.tool === 'white' ? 18 : 4,
      points: [[location.x, location.y]],
    })
    preview.value = stroke
    gesture.value = {
      mode: 'draw',
      startX: location.x,
      startY: location.y,
      layer: stroke,
      revision: state.value!.project.revision,
    }
    return
  }
  if (props.tool === 'panel') {
    const panel = makeLayer('panel', { x: location.x, y: location.y, width: 8, height: 8 })
    preview.value = panel
    gesture.value = {
      mode: 'create',
      startX: location.x,
      startY: location.y,
      layer: panel,
      revision: state.value!.project.revision,
    }
    return
  }
  if (props.tool === 'knife') {
    const target =
      layer?.kind === 'panel'
        ? layer
        : (page.value.layers.find((entry) => entry.id === layer?.parentId) ??
          (selected.value?.kind === 'panel' ? selected.value : undefined))
    if (!target || isLayerLocked(page.value.layers, target)) {
      notice.value = '请先选择一个未锁定的漫画格，再拖动切线'
      window.chiyo.setEditing(false)
      return
    }
    preview.value = JSON.parse(JSON.stringify(target))
    gesture.value = {
      mode: 'knife',
      startX: location.x,
      startY: location.y,
      end: [location.x, location.y],
      layer: JSON.parse(JSON.stringify(target)),
      revision: state.value!.project.revision,
    }
    return
  }
  if (!layer) {
    void execute({ type: 'selection.set', id: null })
    window.chiyo.setEditing(false)
    return
  }
  if (selected.value?.id !== layer.id) void execute({ type: 'selection.set', id: layer.id })
  if (isLayerLocked(page.value.layers, layer)) {
    window.chiyo.setEditing(false)
    return
  }
  if (props.tool === 'nodes') {
    window.chiyo.setEditing(false)
    return
  }
  gesture.value = {
    mode: resize ? 'resize' : 'move',
    startX: location.x,
    startY: location.y,
    layer: JSON.parse(JSON.stringify(layer)),
    revision: state.value!.project.revision,
  }
  preview.value = JSON.parse(JSON.stringify(layer))
}
function handleDown(event: PointerEvent, handle: ShapeHandle): void {
  if (
    !selection.value ||
    !page.value ||
    state.value?.busy ||
    event.button !== 0 ||
    isLayerLocked(page.value.layers, selection.value)
  )
    return
  event.stopPropagation()
  canvas.value?.setPointerCapture(event.pointerId)
  window.chiyo.setEditing(true)
  const location = point(event)
  const layer: Layer = JSON.parse(JSON.stringify(selection.value))
  gesture.value = {
    mode: 'handle',
    handle,
    layer,
    startX: location.x,
    startY: location.y,
    revision: state.value!.project.revision,
  }
  preview.value = JSON.parse(JSON.stringify(layer))
}
function applyMove(event: PointerEvent): void {
  const current = gesture.value
  if (!current || !preview.value) {
    return
  }
  const location = point(event)
  const deltaX = location.x - current.startX
  const deltaY = location.y - current.startY
  if (current.mode === 'knife') {
    let end: Point = [location.x, location.y]
    if (event.shiftKey)
      end =
        Math.abs(deltaX) > Math.abs(deltaY)
          ? [location.x, current.startY]
          : [current.startX, location.y]
    current.end = end
  } else if (current.mode === 'handle' && current.handle) {
    Object.assign(
      preview.value,
      moveShapeHandle(current.layer, current.handle, [location.x, location.y]),
    )
  } else if (current.mode === 'draw') {
    if (preview.value.points.length < 4999) {
      preview.value.points.push([location.x, location.y])
    }
  } else if (current.mode === 'create') {
    preview.value.x = Math.min(current.startX, location.x)
    preview.value.y = Math.min(current.startY, location.y)
    preview.value.width = Math.max(8, Math.abs(deltaX))
    preview.value.height = Math.max(8, Math.abs(deltaY))
  } else if (current.mode === 'resize') {
    preview.value.width = Math.max(8, current.layer.width + deltaX)
    preview.value.height = Math.max(8, current.layer.height + deltaY)
  } else {
    preview.value.x = Math.round(current.layer.x + deltaX)
    preview.value.y = Math.round(current.layer.y + deltaY)
  }
}
async function up(event: PointerEvent): Promise<void> {
  flushMove()
  const current = gesture.value
  const result = preview.value
  if (!current || !result) {
    return
  }
  gesture.value = undefined
  if (canvas.value?.hasPointerCapture(event.pointerId)) {
    canvas.value.releasePointerCapture(event.pointerId)
  }
  if (current.mode === 'knife' && current.end) {
    const from: Point = [current.startX, current.startY]
    await run(async () => {
      splitPanel(current.layer, from, current.end!, props.splitGap)
      await execute({
        type: 'panel.split',
        id: current.layer.id,
        newPanelId: crypto.randomUUID(),
        from,
        to: current.end!,
        gap: props.splitGap,
        childIds: Object.fromEntries(
          (page.value?.layers ?? [])
            .filter((entry) => entry.parentId === current.layer.id)
            .map((entry) => [entry.id, crypto.randomUUID()]),
        ),
      })
    })
  } else if (current.mode === 'handle') {
    if (JSON.stringify(current.layer) !== JSON.stringify(result))
      await execute({
        type: 'layer.update',
        id: result.id,
        patch: {
          shape: result.shape,
          vertices: result.vertices,
          outline: result.outline,
          tails: result.tails,
          lobes: result.lobes,
        },
      })
  } else if (current.mode === 'draw' || current.mode === 'create') {
    if (current.mode === 'draw') {
      const xs = result.points.map((entry) => entry[0])
      const ys = result.points.map((entry) => entry[1])
      result.x = Math.min(...xs)
      result.y = Math.min(...ys)
      result.width = Math.max(8, Math.max(...xs) - result.x)
      result.height = Math.max(8, Math.max(...ys) - result.y)
      result.points = result.points.map(([x, y]) => [x - result.x, y - result.y])
    }
    await execute({ type: 'layer.add', layer: result })
    if (current.mode === 'create') {
      emit('update:tool', 'select')
    }
  } else if (JSON.stringify(current.layer) !== JSON.stringify(result)) {
    await execute({
      type: 'layer.update',
      id: result.id,
      patch: { x: result.x, y: result.y, width: result.width, height: result.height },
    })
  }
  preview.value = undefined
  window.chiyo.setEditing(false)
}
function cancel(): void {
  cancelAnimationFrame(moveFrame)
  moveFrame = 0
  pendingMove = undefined
  window.chiyo.setEditing(false)
  gesture.value = undefined
  preview.value = undefined
}
async function exportPage(): Promise<void> {
  await run(async () => {
    const path = await window.chiyo.exportPng(await renderPng())
    if (path) notice.value = `已导出：${path}`
  })
}
async function renderPng(): Promise<string> {
  if (!canvas.value || !page.value) {
    throw new Error('页面尚未就绪')
  }
  const clone = canvas.value.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-editor-only]').forEach((element) => element.remove())
  clone.setAttribute('width', String(page.value.width))
  clone.setAttribute('height', String(page.value.height))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  for (const image of clone.querySelectorAll('image')) {
    const blob = await (await fetch(image.getAttribute('href')!)).blob()
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
    image.setAttribute('href', dataUrl)
  }
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('页面渲染失败'))
      image.src = url
    })
    const output = document.createElement('canvas')
    output.width = page.value.width
    output.height = page.value.height
    output.getContext('2d')!.drawImage(image, 0, 0)
    return output.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
onMounted(() => {
  window.chiyoFrontendError = () => error.value
  window.chiyoCanvasPoints = (points) => {
    const matrix = canvas.value?.getScreenCTM()
    const bounds = viewport.value?.getBoundingClientRect()
    if (!matrix || !bounds) throw new Error('画布未就绪')
    const projected = points.map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix))
    if (
      projected.some(
        (p) =>
          p.x < bounds.left + 1 ||
          p.x > bounds.right - 1 ||
          p.y < bounds.top + 1 ||
          p.y > bounds.bottom - 1,
      )
    )
      throw new Error('坐标不在可见画布内，请先适合窗口或调整缩放')
    error.value = ''
    return projected.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
  }
  window.chiyoRenderPage = renderPng
})
function escape(event: KeyboardEvent): void {
  if (event.key === 'Escape') cancel()
}
onMounted(() => window.addEventListener('keydown', escape))
onUnmounted(() => {
  cancel()
  window.removeEventListener('keydown', escape)
})
defineExpose({ fit: navigation.fit, setZoom: navigation.setZoom, exportPage })
</script>

<template>
  <div
    ref="viewport"
    class="canvas-viewport"
    :class="{
      drawing: tool !== 'select',
      'hand-tool': navigation.hand.value,
      panning: !!navigation.pan.value,
    }"
    @pointerdown.capture="navigation.beginPan"
    @pointermove="navigation.movePan"
    @pointerup="navigation.endPan"
    @pointercancel="navigation.endPan"
    @lostpointercapture="navigation.endPan"
    @auxclick.middle.prevent
    @contextmenu="menu"
  >
    <div
      v-if="page"
      class="paper-wrap"
      :style="{
        width: `${svgWidth}px`,
        height: `${svgHeight}px`,
        transform: navigation.paperTransform.value,
      }"
    >
      <svg
        ref="canvas"
        class="page-canvas"
        :width="svgWidth"
        :height="svgHeight"
        :viewBox="`0 0 ${page.width} ${page.height}`"
        aria-label="漫画页面画布"
        @pointerdown="down($event)"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="cancel"
      >
        <rect
          :width="page.width"
          :height="page.height"
          fill="#ffffff"
        />
        <PanelClips
          :panels="panels"
          prefix="clip-"
        />
        <rect
          v-if="showGuides"
          data-editor-only="true"
          :x="page.margin"
          :y="page.margin"
          :width="page.width - page.margin * 2"
          :height="page.height - page.margin * 2"
          fill="none"
          stroke="#d49ca6"
          stroke-width="1"
          stroke-dasharray="8 8"
          pointer-events="none"
        />
        <LayerArtwork
          :layers="layers"
          clip-prefix="clip-"
          interactive
          @down="down"
        />
        <LayerVisual
          v-if="preview && (gesture?.mode === 'create' || gesture?.mode === 'draw')"
          :layer="preview"
          data-editor-only="true"
        />
        <ShapeHandles
          v-if="
            selection &&
            tool === 'nodes' &&
            isLayerVisible(layers, selection) &&
            !isLayerLocked(layers, selection)
          "
          :layer="selection"
          :zoom="zoom"
          @down="handleDown"
        />
        <g
          v-if="gesture?.mode === 'knife' && gesture.end"
          data-editor-only="true"
          pointer-events="none"
        >
          <line
            :x1="gesture.startX"
            :y1="gesture.startY"
            :x2="gesture.end[0]"
            :y2="gesture.end[1]"
            stroke="#ffffff"
            :stroke-width="splitGap"
            opacity="0.75"
          />
          <line
            :x1="gesture.startX"
            :y1="gesture.startY"
            :x2="gesture.end[0]"
            :y2="gesture.end[1]"
            stroke="#d86c93"
            :stroke-width="1.5 / zoom"
            :stroke-dasharray="`${5 / zoom} ${5 / zoom}`"
          />
        </g>
        <g
          v-if="
            selection &&
            selection.kind !== 'group' &&
            isLayerVisible(layers, selection) &&
            tool === 'select'
          "
          data-editor-only="true"
        >
          <rect
            :x="selection.x"
            :y="selection.y"
            :width="selection.width"
            :height="selection.height"
            fill="none"
            stroke="#db7690"
            :stroke-width="1.5 / zoom"
            pointer-events="none"
          />
          <rect
            v-if="!isLayerLocked(layers, selection)"
            :x="selection.x + selection.width - 5 / zoom"
            :y="selection.y + selection.height - 5 / zoom"
            :width="10 / zoom"
            :height="10 / zoom"
            fill="#ffffff"
            stroke="#db7690"
            :stroke-width="1 / zoom"
            class="resize-handle"
            @pointerdown="down($event, selection, true)"
          />
        </g>
      </svg>
    </div>
  </div>
</template>
