<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { contextMenu, type MenuItem } from '../context-menu'
const menu = ref<HTMLElement>()
const position = ref({ left: '0px', top: '0px' })
let previousFocus: HTMLElement | null = null
function close(restore = false): void {
  contextMenu.value = undefined
  if (restore) previousFocus?.focus({ preventScroll: true })
}
watch(contextMenu, async (value) => {
  if (!value) return
  previousFocus = document.activeElement as HTMLElement
  position.value = { left: `${value.x}px`, top: `${value.y}px` }
  await nextTick()
  const bounds = menu.value?.getBoundingClientRect()
  if (!bounds) return
  position.value = {
    left: `${Math.max(8, Math.min(value.x, innerWidth - bounds.width - 8))}px`,
    top: `${Math.max(44, Math.min(value.y, innerHeight - bounds.height - 8))}px`,
  }
  menu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
})
function outside(event: PointerEvent): void {
  if (!menu.value?.contains(event.target as Node)) close()
}
function keys(event: KeyboardEvent): void {
  if (!contextMenu.value) return
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    event.stopImmediatePropagation()
    close(true)
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  const buttons = [
    ...(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
  ]
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  let next = (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = buttons.length - 1
  buttons[next]?.focus()
}
function choose(item: MenuItem): void {
  close()
  item.run()
}
function dismiss(): void {
  close()
}
onMounted(() => {
  window.addEventListener('pointerdown', outside)
  window.addEventListener('keydown', keys, true)
  window.addEventListener('blur', dismiss)
  window.addEventListener('resize', dismiss)
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', outside)
  window.removeEventListener('keydown', keys, true)
  window.removeEventListener('blur', dismiss)
  window.removeEventListener('resize', dismiss)
})
</script>
<template>
  <Teleport to="body">
    <div
      v-if="contextMenu"
      ref="menu"
      class="context-menu menu-popup"
      role="menu"
      aria-label="右键菜单"
      :style="position"
      @contextmenu.prevent
    >
      <button
        v-for="item in contextMenu.items"
        :key="item.label"
        role="menuitem"
        :disabled="item.disabled"
        :class="{ danger: item.danger }"
        @click="choose(item)"
      >
        {{ item.label }}<kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
      </button>
    </div>
  </Teleport>
</template>
