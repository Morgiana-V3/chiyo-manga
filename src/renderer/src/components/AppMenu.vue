<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Save, Download } from 'lucide-vue-next'
import { state, selected, execute, file, addFolder } from '../editor'
import { canPasteLayers, copyLayer, pasteLayers, duplicateLayer } from '../layer-clipboard'
function clipboardAction(action: 'copy' | 'paste' | 'duplicate'): void {
  menu.value = ''
  if (action === 'copy') copyLayer()
  if (action === 'paste') void pasteLayers()
  if (action === 'duplicate') void duplicateLayer()
}
const emit = defineEmits<{ fit: []; zoom: [value: number]; export: []; layers: [] }>()
const menu = ref('')
const container = ref<HTMLElement>()
function close(event: PointerEvent): void {
  if (!container.value?.contains(event.target as Node)) {
    menu.value = ''
  }
}
async function fileAction(command: 'new' | 'open' | 'save' | 'saveAs'): Promise<void> {
  menu.value = ''
  await file(command)
}
function rename(event: Event): void {
  void execute({ type: 'project.rename', name: (event.target as HTMLInputElement).value })
}
function folder(): void {
  menu.value = ''
  emit('layers')
  addFolder()
}
function showLayers(): void {
  menu.value = ''
  emit('layers')
}
function view(value: number | 'fit'): void {
  menu.value = ''
  if (value === 'fit') {
    emit('fit')
  } else {
    emit('zoom', value)
  }
}
function exportPage(): void {
  menu.value = ''
  emit('export')
}
onMounted(() => window.addEventListener('pointerdown', close))
onUnmounted(() => window.removeEventListener('pointerdown', close))
</script>

<template>
  <header
    ref="container"
    class="app-header"
    @keydown.esc="menu = ''"
  >
    <img
      class="app-icon"
      src="/icon.png"
      alt="千代"
    />
    <nav
      class="app-menubar"
      aria-label="应用菜单"
    >
      <div
        v-for="name in ['文件', '编辑', '图层', '视图']"
        :key="name"
        class="file-menu"
      >
        <button
          :class="{ active: menu === name }"
          :aria-expanded="menu === name"
          aria-haspopup="menu"
          @click="menu = menu === name ? '' : name"
        >
          {{ name }}
        </button>
        <div
          v-if="menu === name"
          class="menu-popup"
          role="menu"
        >
          <template v-if="name === '文件'">
            <button
              role="menuitem"
              :disabled="state?.busy"
              @click="fileAction('new')"
            >
              新建作品
            </button>
            <button
              role="menuitem"
              :disabled="state?.busy"
              @click="fileAction('open')"
            >
              打开工程…<kbd>Ctrl+O</kbd>
            </button>
            <button
              role="menuitem"
              :disabled="state?.busy"
              @click="fileAction('save')"
            >
              保存<kbd>Ctrl+S</kbd>
            </button>
            <button
              role="menuitem"
              :disabled="state?.busy"
              @click="fileAction('saveAs')"
            >
              另存为…
            </button>
            <button
              role="menuitem"
              :disabled="state?.busy"
              @click="exportPage"
            >
              导出 PNG…
            </button>
          </template>
          <template v-else-if="name === '编辑'">
            <button
              role="menuitem"
              :disabled="!selected || state?.busy"
              @click="clipboardAction('copy')"
            >
              复制图层<kbd>Ctrl+C</kbd>
            </button>
            <button
              role="menuitem"
              :disabled="!canPasteLayers || state?.busy"
              @click="clipboardAction('paste')"
            >
              粘贴图层<kbd>Ctrl+V</kbd>
            </button>
            <button
              role="menuitem"
              :disabled="!selected || state?.busy"
              @click="clipboardAction('duplicate')"
            >
              创建副本<kbd>Ctrl+D</kbd>
            </button>
            <button
              role="menuitem"
              :disabled="!state?.canUndo || state.busy"
              @click="execute({ type: 'history.undo' })"
            >
              撤销<kbd>Ctrl+Z</kbd>
            </button>
            <button
              role="menuitem"
              :disabled="!state?.canRedo || state.busy"
              @click="execute({ type: 'history.redo' })"
            >
              重做<kbd>Ctrl+Y</kbd>
            </button>
          </template>
          <template v-else-if="name === '图层'">
            <button
              role="menuitem"
              :disabled="state?.busy"
              @click="folder"
            >
              新建文件夹
            </button>
            <button
              role="menuitem"
              @click="showLayers"
            >
              显示图层面板
            </button>
          </template>
          <template v-else>
            <button
              role="menuitem"
              @click="view('fit')"
            >
              适合窗口<kbd>Ctrl+0</kbd>
            </button>
            <button
              role="menuitem"
              @click="view(1)"
            >
              实际大小 100%<kbd>Ctrl+1</kbd>
            </button>
            <button
              role="menuitem"
              @click="view(2)"
            >
              放大到 200%
            </button>
          </template>
        </div>
      </div>
    </nav>
    <div
      v-if="state"
      class="project-heading"
    >
      <input
        :value="state.project.name"
        aria-label="作品名称"
        maxlength="200"
        @change="rename"
      />
      <span
        class="save-indicator"
        :title="state.dirty ? '修改已自动恢复保存，尚未写入工程文件' : '工程已保存'"
        >{{ state.dirty ? '未保存' : '已保存' }}</span
      >
    </div>
    <div class="header-actions">
      <button
        aria-label="保存"
        title="保存 Ctrl+S"
        :disabled="state?.busy"
        @click="file('save')"
      >
        <Save :size="14" />
      </button>
      <button
        :disabled="state?.busy"
        @click="exportPage"
      >
        <Download :size="14" />导出 PNG
      </button>
    </div>
  </header>
</template>
