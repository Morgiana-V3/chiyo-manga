<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  LockKeyhole,
  UnlockKeyhole,
  GripVertical,
  Frame,
  Type,
  Image,
  MessageCircle,
  PenLine,
  ScanLine,
} from 'lucide-vue-next'
import { useLayerDrag } from '../layer-drag'
import { openMenu, layerMenu, folderMenu, renameRequest } from '../context-menu'
import type { Layer } from '../../../shared/model'
import { childrenOf, isLayerLocked, isLayerVisible } from '../../../shared/layers'
import { page, state, selected, execute, addFolder } from '../editor'

const collapsed = ref(new Set<string>())
const drag = useLayerDrag((id) => collapsed.value.delete(id))
const dragging = drag.dragging
const dropTarget = drag.target
const renaming = ref<string>()
const renameValue = ref('')
watch(
  renameRequest,
  async (id) => {
    if (!id) return
    const layer = page.value?.layers.find((entry) => entry.id === id)
    if (!layer || state.value?.busy || isLayerLocked(page.value!.layers, layer)) {
      renameRequest.value = undefined
      return
    }
    let folder = layer.folderId
    while (folder) {
      collapsed.value.delete(folder)
      folder = page.value?.layers.find((entry) => entry.id === folder)?.folderId
    }
    renaming.value = id
    renameValue.value = layer.name
    window.chiyo.setEditing(true)
    await nextTick()
    const input = document.querySelector<HTMLInputElement>('.layer-rename')
    input?.focus()
    input?.select()
  },
  { immediate: true },
)
async function finishRename(commit: boolean): Promise<void> {
  const id = renaming.value
  if (!id) return
  const name = renameValue.value.trim()
  renaming.value = undefined
  renameRequest.value = undefined
  const layer = page.value?.layers.find((entry) => entry.id === id)
  if (commit && name && name !== layer?.name)
    await execute({ type: 'layer.update', id, patch: { name } })
  window.chiyo.setEditing(false)
}
function menu(event: MouseEvent, layer: Layer): void {
  if (selected.value?.id !== layer.id) void execute({ type: 'selection.set', id: layer.id })
  openMenu(event, layerMenu(layer))
}
onUnmounted(() => {
  if (renaming.value) {
    renameRequest.value = undefined
    window.chiyo.setEditing(false)
  }
})
const rows = computed(() => {
  const result: { layer: Layer; depth: number; locked: boolean; visible: boolean }[] = []
  const layers = page.value?.layers ?? []
  function visit(folderId: string | null, depth: number): void {
    for (const layer of [...childrenOf(layers, folderId)].reverse()) {
      result.push({
        layer,
        depth,
        locked: isLayerLocked(layers, layer),
        visible: isLayerVisible(layers, layer),
      })
      if (layer.kind === 'group' && !collapsed.value.has(layer.id)) {
        visit(layer.id, depth + 1)
      }
    }
  }
  visit(null, 0)
  return result
})
const icons = {
  panel: Frame,
  image: Image,
  text: Type,
  balloon: MessageCircle,
  stroke: PenLine,
  effect: ScanLine,
  group: Folder,
}
function toggle(id: string): void {
  const next = new Set(collapsed.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  collapsed.value = next
}
</script>

<template>
  <section
    class="layers-section"
    aria-label="图层管理"
    @contextmenu="openMenu($event, folderMenu())"
    @click.capture="drag.click"
  >
    <div class="section-heading">
      <h2>图层</h2>
      <button
        class="icon-button"
        aria-label="新建文件夹"
        title="新建文件夹"
        :disabled="state?.busy"
        @click="addFolder"
      >
        <FolderPlus :size="16" />
      </button>
    </div>
    <div
      class="layer-root-drop"
      :class="{ 'drop-inside': dragging && dropTarget?.id === null }"
    >
      页面根目录
    </div>
    <p
      v-if="!rows.length"
      class="empty-state"
    >
      暂无图层
    </p>
    <div
      v-for="row in rows"
      :key="row.layer.id"
      class="layer-row"
      :data-layer-id="row.layer.id"
      :data-folder-id="row.layer.folderId ?? ''"
      :class="{
        active: row.layer.id === selected?.id,
        'layer-hidden': !row.visible,
        'layer-dragging': dragging === row.layer.id,
        'drop-above': dropTarget?.id === row.layer.id && dropTarget?.placement === 'above',
        'drop-below': dropTarget?.id === row.layer.id && dropTarget?.placement === 'below',
        'drop-inside': dropTarget?.id === row.layer.id && dropTarget?.placement === 'inside',
      }"
      :style="{ paddingLeft: `${row.depth * 15 + 3}px` }"
      @pointerdown="drag.start($event, row.layer)"
      @contextmenu="menu($event, row.layer)"
    >
      <GripVertical
        class="layer-grip"
        :size="11"
      />
      <button
        v-if="row.layer.kind === 'group'"
        class="icon-button folder-toggle"
        :aria-label="`${collapsed.has(row.layer.id) ? '展开' : '折叠'} ${row.layer.name}`"
        @click="toggle(row.layer.id)"
      >
        <component
          :is="collapsed.has(row.layer.id) ? ChevronRight : ChevronDown"
          :size="12"
        />
      </button>
      <span
        v-else
        class="folder-toggle"
      />
      <input
        v-if="renaming === row.layer.id"
        v-model="renameValue"
        class="layer-rename"
        aria-label="图层名称"
        maxlength="160"
        @keydown.enter.stop.prevent="finishRename(true)"
        @keydown.esc.stop.prevent="finishRename(false)"
        @blur="finishRename(true)"
        @pointerdown.stop
      />
      <button
        v-else
        class="layer-select"
        :title="row.layer.name"
        @click="
          selected?.id !== row.layer.id && execute({ type: 'selection.set', id: row.layer.id })
        "
        @dblclick="renameRequest = row.layer.id"
      >
        <component
          :is="
            row.layer.kind === 'group' && !collapsed.has(row.layer.id)
              ? FolderOpen
              : icons[row.layer.kind]
          "
          :size="14"
        /><span>{{ row.layer.name }}</span>
      </button>
      <button
        class="icon-button"
        :aria-label="`${row.layer.visible ? '隐藏' : '显示'} ${row.layer.name}`"
        :disabled="state?.busy"
        @click="
          execute({
            type: 'layer.update',
            id: row.layer.id,
            patch: { visible: !row.layer.visible },
          })
        "
      >
        <component
          :is="row.visible ? Eye : EyeOff"
          :size="13"
        />
      </button>
      <button
        class="icon-button"
        :aria-label="`${row.layer.locked ? '解锁' : '锁定'} ${row.layer.name}`"
        :disabled="state?.busy"
        @click="
          execute({ type: 'layer.update', id: row.layer.id, patch: { locked: !row.layer.locked } })
        "
      >
        <component
          :is="row.locked ? LockKeyhole : UnlockKeyhole"
          :size="12"
        />
      </button>
    </div>
    <Teleport to="body"
      ><div
        v-if="dragging"
        class="layer-drag-ghost"
        :style="{ transform: `translate3d(${drag.ghost.value.x}px, ${drag.ghost.value.y}px, 0)` }"
      >
        {{ drag.ghost.value.name
        }}<small>{{
          dropTarget ? (dropTarget.placement === 'inside' ? '移入目录' : '调整顺序') : '无法放置'
        }}</small>
      </div></Teleport
    >
  </section>
</template>
