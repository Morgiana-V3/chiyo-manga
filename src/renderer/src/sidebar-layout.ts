import { computed, onMounted, onUnmounted, ref } from 'vue'

export function useSidebarLayout() {
  const left = ref(244)
  const right = ref(284)
  const resizing = ref(false)
  let drag:
    | { side: 'left' | 'right'; x: number; width: number; element: HTMLElement; id: number }
    | undefined
  function constrain(side: 'left' | 'right', width: number): void {
    const other = side === 'left' ? right.value : left.value
    const minimum = side === 'left' ? 190 : 230
    const next = Math.max(
      minimum,
      Math.min(side === 'left' ? 420 : 480, innerWidth - other - 470, width),
    )
    if (side === 'left') left.value = next
    else right.value = next
  }
  function save(): void {
    try {
      localStorage.setItem('chiyo.sidebar-widths', JSON.stringify([left.value, right.value]))
    } catch {
      /* Layout preferences are optional. */
    }
  }
  function resizeWindow(): void {
    constrain('left', left.value)
    constrain('right', right.value)
  }
  function start(event: PointerEvent, side: 'left' | 'right'): void {
    if (event.button !== 0) return
    event.preventDefault()
    const element = event.currentTarget as HTMLElement
    drag = {
      side,
      x: event.clientX,
      width: side === 'left' ? left.value : right.value,
      element,
      id: event.pointerId,
    }
    element.setPointerCapture(event.pointerId)
    resizing.value = true
  }
  function move(event: PointerEvent): void {
    if (!drag) return
    constrain(drag.side, drag.width + (event.clientX - drag.x) * (drag.side === 'left' ? 1 : -1))
  }
  function end(): void {
    const previous = drag
    drag = undefined
    resizing.value = false
    if (previous?.element.hasPointerCapture(previous.id))
      previous.element.releasePointerCapture(previous.id)
    save()
  }
  function reset(side: 'left' | 'right'): void {
    constrain(side, side === 'left' ? 244 : 284)
    save()
  }
  function key(event: KeyboardEvent, side: 'left' | 'right'): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Home') {
      reset(side)
      return
    }
    const delta = (event.key === 'ArrowRight' ? 16 : -16) * (side === 'left' ? 1 : -1)
    constrain(side, (side === 'left' ? left.value : right.value) + delta)
    save()
  }
  onMounted(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('chiyo.sidebar-widths') ?? 'null')
      if (
        Array.isArray(saved) &&
        saved.length === 2 &&
        saved.every((value) => typeof value === 'number' && Number.isFinite(value))
      ) {
        left.value = saved[0]
        right.value = saved[1]
      }
    } catch {
      /* Ignore invalid layout preferences. */
    }
    resizeWindow()
    window.addEventListener('resize', resizeWindow)
    window.addEventListener('blur', end)
  })
  onUnmounted(() => {
    window.removeEventListener('resize', resizeWindow)
    window.removeEventListener('blur', end)
  })
  return {
    left,
    right,
    resizing,
    start,
    move,
    end,
    reset,
    key,
    style: computed(() => ({
      '--sidebar-left': `${left.value}px`,
      '--sidebar-right': `${right.value}px`,
    })),
  }
}
