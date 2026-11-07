import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { page } from './editor'

export function useCanvasViewport(
  viewport: Ref<HTMLElement | undefined>,
  zoom: () => number,
  tool: () => string,
  updateZoom: (value: number) => void,
) {
  const offset = ref({ x: 0, y: 0 })
  const spacePressed = ref(false)
  let frame = 0
  let pendingOffset: { x: number; y: number } | undefined
  function flushPan(): void {
    cancelAnimationFrame(frame)
    frame = 0
    if (pendingOffset) offset.value = pendingOffset
    pendingOffset = undefined
  }
  const pan = ref<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number }>()
  const hand = computed(() => tool() === 'hand' || spacePressed.value || !!pan.value)
  const paperTransform = computed(
    () => `translate3d(calc(-50% + ${offset.value.x}px), calc(-50% + ${offset.value.y}px), 0)`,
  )

  function setZoom(value: number, clientX?: number, clientY?: number): void {
    const next = Math.max(0.05, Math.min(4, value))
    const bounds = viewport.value?.getBoundingClientRect()
    const x = bounds && clientX !== undefined ? clientX - bounds.left - bounds.width / 2 : 0
    const y = bounds && clientY !== undefined ? clientY - bounds.top - bounds.height / 2 : 0
    const ratio = next / zoom()
    offset.value = { x: x - (x - offset.value.x) * ratio, y: y - (y - offset.value.y) * ratio }
    updateZoom(next)
  }
  function fit(): void {
    if (!viewport.value || !page.value) {
      return
    }
    offset.value = { x: 0, y: 0 }
    updateZoom(
      Math.max(
        0.05,
        Math.min(
          (viewport.value.clientWidth - 80) / page.value.width,
          (viewport.value.clientHeight - 60) / page.value.height,
          1,
        ),
      ),
    )
  }
  function beginPan(event: PointerEvent): void {
    if (!viewport.value || (event.button !== 1 && !(event.button === 0 && hand.value))) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    pan.value = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.value.x,
      offsetY: offset.value.y,
    }
    viewport.value.setPointerCapture(event.pointerId)
  }
  function movePan(event: PointerEvent): void {
    if (pan.value) {
      pendingOffset = {
        x: pan.value.offsetX + event.clientX - pan.value.x,
        y: pan.value.offsetY + event.clientY - pan.value.y,
      }
      if (!frame) frame = requestAnimationFrame(flushPan)
    }
  }
  function endPan(): void {
    flushPan()
    if (pan.value && viewport.value?.hasPointerCapture(pan.value.pointerId)) {
      viewport.value.releasePointerCapture(pan.value.pointerId)
    }
    pan.value = undefined
  }
  function wheel(event: WheelEvent): void {
    event.preventDefault()
    if (pan.value) {
      return
    }
    if (event.shiftKey) {
      offset.value.x -= event.deltaY || event.deltaX
    } else {
      setZoom(
        zoom() * Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * 0.0015),
        event.clientX,
        event.clientY,
      )
    }
  }
  function keyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement
    if (
      event.code !== 'Space' ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      !!target.closest('[role="menu"], .app-menubar') ||
      target.isContentEditable
    ) {
      return
    }
    event.preventDefault()
    spacePressed.value = true
  }
  function keyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      if (spacePressed.value) event.preventDefault()
      spacePressed.value = false
    }
  }
  function resetKeys(): void {
    spacePressed.value = false
    endPan()
  }
  watch(
    () => page.value?.id,
    () => {
      resetKeys()
      fit()
    },
    { flush: 'post' },
  )
  onMounted(() => {
    fit()
    viewport.value?.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', resetKeys)
  })
  onUnmounted(() => {
    cancelAnimationFrame(frame)
    viewport.value?.removeEventListener('wheel', wheel)
    window.removeEventListener('keydown', keyDown)
    window.removeEventListener('keyup', keyUp)
    window.removeEventListener('blur', resetKeys)
  })
  return { hand, pan, paperTransform, setZoom, fit, beginPan, movePan, endPan }
}
