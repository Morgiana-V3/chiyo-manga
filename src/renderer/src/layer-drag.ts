import { onUnmounted, ref, shallowRef } from 'vue'
import type { Layer } from '../../shared/model'
import { isLayerLocked, subtreeIds } from '../../shared/layers'
import { page, state, execute, error } from './editor'

export function useLayerDrag(expand: (id: string) => void) {
  const dragging = ref<string>()
  const ghost = shallowRef({ x: 0, y: 0, name: '' })
  const target = shallowRef<{ id: string | null; placement: 'above' | 'below' | 'inside' }>()
  let pending:
    | {
        id: string
        name: string
        x: number
        y: number
        pointerId: number
        revision: number
        element: HTMLElement
        scroll: HTMLElement
        excluded: Set<string>
      }
    | undefined
  let pointer = { x: 0, y: 0 }
  let frame = 0
  let lastTime = 0
  let suppressClick = false
  function tick(time: number): void {
    if (!pending || !dragging.value) return
    const bounds = pending.scroll.getBoundingClientRect()
    const elapsed = Math.min(32, time - (lastTime || time))
    lastTime = time
    let speed = 0
    if (pointer.y < bounds.top + 32) speed = -1
    if (pointer.y > bounds.bottom - 32) speed = 1
    if (pointer.x >= bounds.left && pointer.x <= bounds.right)
      pending.scroll.scrollTop += speed * elapsed * 0.45
    ghost.value = { x: pointer.x + 14, y: pointer.y + 12, name: pending.name }
    const hit = document
      .elementFromPoint(pointer.x, pointer.y)
      ?.closest<HTMLElement>('[data-layer-id], .layer-root-drop')
    let next: typeof target.value
    if (hit && pending.scroll.contains(hit)) {
      const id = hit.dataset.layerId ?? null
      const layer = page.value?.layers.find((entry) => entry.id === id)
      const box = hit.getBoundingClientRect()
      const fraction = (pointer.y - box.top) / box.height
      let placement: 'above' | 'below' | 'inside' = fraction < 0.5 ? 'above' : 'below'
      if (!layer || (layer.kind === 'group' && fraction > 0.25 && fraction < 0.75))
        placement = 'inside'
      if (!id || (!pending.excluded.has(id) && layer && !isLayerLocked(page.value!.layers, layer)))
        next = { id, placement }
    }
    if (next?.id !== target.value?.id || next?.placement !== target.value?.placement)
      target.value = next
    frame = requestAnimationFrame(tick)
  }
  function start(event: PointerEvent, layer: Layer): void {
    if (
      event.button !== 0 ||
      state.value?.busy ||
      !page.value ||
      isLayerLocked(page.value.layers, layer)
    )
      return
    const source = event.target as Element
    if (source.closest('input, .icon-button')) return
    const element = event.currentTarget as HTMLElement
    const scroll = element.closest<HTMLElement>('.sidebar-scroll')!
    pending = {
      id: layer.id,
      name: layer.name,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      revision: state.value!.project.revision,
      element,
      scroll,
      excluded: subtreeIds(page.value.layers, layer.id),
    }
    pointer = { x: event.clientX, y: event.clientY }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', escape)
  }
  function move(event: PointerEvent): void {
    if (!pending || pending.pointerId !== event.pointerId) return
    pointer = { x: event.clientX, y: event.clientY }
    if (!dragging.value && Math.hypot(pointer.x - pending.x, pointer.y - pending.y) > 5) {
      dragging.value = pending.id
      pending.element.setPointerCapture(event.pointerId)
      window.chiyo.setEditing(true)
      suppressClick = true
      lastTime = 0
      tick(performance.now())
    }
    if (dragging.value) event.preventDefault()
  }
  function clear(): void {
    cancelAnimationFrame(frame)
    const previous = pending
    pending = undefined
    dragging.value = undefined
    target.value = undefined
    if (previous?.element.hasPointerCapture(previous.pointerId))
      previous.element.releasePointerCapture(previous.pointerId)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('blur', cancel)
    window.removeEventListener('keydown', escape)
  }
  async function release(event: PointerEvent): Promise<void> {
    if (!pending || pending.pointerId !== event.pointerId) return
    if (dragging.value) {
      pointer = { x: event.clientX, y: event.clientY }
      cancelAnimationFrame(frame)
      tick(performance.now())
    }
    const previous = pending
    const destination = target.value
    const active = !!dragging.value
    clear()
    setTimeout(() => {
      suppressClick = false
    }, 0)
    if (!active || !previous) return
    if (destination) {
      if (state.value?.project.revision !== previous.revision)
        error.value = '图层已变化，请重新拖动'
      else {
        await execute({
          type: 'layer.move',
          id: previous.id,
          targetId: destination.id,
          placement: destination.placement,
        })
        if (destination.id && destination.placement === 'inside') expand(destination.id)
      }
    }
    window.chiyo.setEditing(false)
  }
  function cancel(): void {
    const active = !!dragging.value
    clear()
    if (active) window.chiyo.setEditing(false)
  }
  function escape(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }
  function click(event: MouseEvent): void {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }
  onUnmounted(cancel)
  return { dragging, ghost, target, start, click }
}
