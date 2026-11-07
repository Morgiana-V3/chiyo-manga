<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import {
  MousePointer2,
  Scissors,
  Spline,
  Hand,
  PanelsTopLeft,
  Type,
  MessageCircle,
  PenLine,
  Eraser,
  ScanLine,
  Undo2,
  Redo2,
  Plus,
  ZoomIn,
  ZoomOut,
  Frame,
  X,
} from 'lucide-vue-next'
import { makeLayer, type Layer } from '../../shared/model'
import {
  state,
  page,
  selected,
  error,
  notice,
  execute,
  file,
  importAssets,
  addLayer,
  run,
} from './editor'
import PageCanvas from './components/PageCanvas.vue'
import LayerArtwork from './components/LayerArtwork.vue'
import LayerTree from './components/LayerTree.vue'
import AppMenu from './components/AppMenu.vue'
import PanelClips from './components/PanelClips.vue'
import AssetLibrary from './components/AssetLibrary.vue'
import ObjectInspector from './components/ObjectInspector.vue'
import AgentPanel from './components/AgentPanel.vue'
import GenerationPanel from './components/GenerationPanel.vue'

import ContextMenu from './components/ContextMenu.vue'
import { contextMenu, openMenu, renameRequest, pasteMenuItem } from './context-menu'
import { copyLayer, pasteLayers, duplicateLayer } from './layer-clipboard'
import { useSidebarLayout } from './sidebar-layout'

const layout = useSidebarLayout()
const handActive = ref(false)
watch(renameRequest, (id) => {
  if (id) leftTab.value = 'layers'
})
const tool = ref('select')
const zoom = ref(0.4)
const splitGap = ref(20)
const showGuides = ref(true)
const rightTab = ref('properties')
const leftTab = ref('assets')
const canvas = ref<InstanceType<typeof PageCanvas>>()
let unsubscribe: (() => void) | undefined
const tools = [
  { id: 'select', label: '选择与移动 (V)', icon: MousePointer2 },
  { id: 'hand', label: '抓手平移 (H / 空格 / 中键)', icon: Hand },
  { id: 'panel', label: '绘制漫画格 (F)', icon: PanelsTopLeft },
  { id: 'knife', label: '切分漫画格 (K)', icon: Scissors },
  { id: 'nodes', label: '编辑轮廓与尾巴 (N)', icon: Spline },
  { id: 'balloon', label: '添加气泡 (B)', icon: MessageCircle },
  { id: 'text', label: '添加文字 (T)', icon: Type },
  { id: 'pen', label: '黑色画笔 (P)', icon: PenLine },
  { id: 'white', label: '白色修正 (E)', icon: Eraser },
  { id: 'effect', label: '添加网点', icon: ScanLine },
]
function useTool(id: string): void {
  if (['balloon', 'text', 'effect'].includes(id)) {
    addLayer(id as Layer['kind'])
    tool.value = 'select'
  } else {
    tool.value = id
  }
}
function addPage(): void {
  if (!page.value || !state.value) {
    return
  }
  void execute({
    type: 'page.add',
    page: {
      ...JSON.parse(JSON.stringify(page.value)),
      id: crypto.randomUUID(),
      name: `第 ${state.value.project.pages.length + 1} 页`,
      layers: [],
    },
  })
}
async function template(): Promise<void> {
  if (!page.value || page.value.layers.length) {
    return
  }
  const { width, height, margin } = page.value
  const gap = 24
  const innerWidth = width - margin * 2
  const innerHeight = height - margin * 2
  const rectangles = [
    { x: margin, y: margin, width: innerWidth, height: innerHeight * 0.32 },
    {
      x: margin + innerWidth * 0.45 + gap,
      y: margin + innerHeight * 0.32 + gap,
      width: innerWidth * 0.55 - gap,
      height: innerHeight * 0.3,
    },
    {
      x: margin,
      y: margin + innerHeight * 0.32 + gap,
      width: innerWidth * 0.45,
      height: innerHeight * 0.3,
    },
    {
      x: margin,
      y: margin + innerHeight * 0.62 + gap * 2,
      width: innerWidth,
      height: innerHeight * 0.38 - gap * 2,
    },
  ]
  for (const [index, rectangle] of rectangles.entries()) {
    await execute({
      type: 'layer.add',
      layer: makeLayer('panel', { name: `第 ${index + 1} 格`, ...rectangle }),
    })
  }
}
function shortcut(event: KeyboardEvent): void {
  if (contextMenu.value) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    void file('save')
    return
  }
  const target = event.target as HTMLElement
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.isContentEditable ||
    state.value?.busy
  ) {
    return
  }
  if (event.ctrlKey || event.metaKey) {
    if (['c', 'v', 'd'].includes(event.key.toLowerCase())) {
      event.preventDefault()
      if (event.key.toLowerCase() === 'c') copyLayer()
      if (event.key.toLowerCase() === 'v') void pasteLayers()
      if (event.key.toLowerCase() === 'd') void duplicateLayer()
      return
    }
    if (event.key === '0') {
      event.preventDefault()
      canvas.value?.fit()
    }
    if (event.key === '1') {
      event.preventDefault()
      canvas.value?.setZoom(1)
    }
    if (event.key.toLowerCase() === 'o') {
      event.preventDefault()
      void file('open')
    }
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault()
      void execute({ type: event.shiftKey ? 'history.redo' : 'history.undo' })
    }
    if (event.key.toLowerCase() === 'y') {
      event.preventDefault()
      void execute({ type: 'history.redo' })
    }
    return
  }
  if (event.key === 'F2' && selected.value) {
    event.preventDefault()
    renameRequest.value = selected.value.id
  }
  if (event.key === 'Delete' && selected.value && !selected.value.locked) {
    void execute({ type: 'layer.remove', id: selected.value.id })
  }
  const keys: Record<string, string> = {
    v: 'select',
    h: 'hand',
    f: 'panel',
    k: 'knife',
    n: 'nodes',
    b: 'balloon',
    t: 'text',
    p: 'pen',
    e: 'white',
  }
  if (keys[event.key.toLowerCase()]) {
    useTool(keys[event.key.toLowerCase()])
  }
  if (event.key === 'Escape') {
    tool.value = 'select'
  }
}
onMounted(async () => {
  window.chiyoSetView = (options) => {
    if (options.tool) tool.value = options.tool
    if (options.leftTab) leftTab.value = options.leftTab
    if (options.rightTab) rightTab.value = options.rightTab
    if (options.zoom !== undefined) canvas.value?.setZoom(options.zoom)
    if (options.fit) canvas.value?.fit()
    if (options.showGuides !== undefined) showGuides.value = options.showGuides
    return {
      tool: tool.value as typeof options.tool,
      leftTab: leftTab.value as typeof options.leftTab,
      rightTab: rightTab.value as typeof options.rightTab,
      zoom: zoom.value,
      showGuides: showGuides.value,
    }
  }
  unsubscribe = window.chiyo.onState((next) => {
    state.value = next
    if (next.proposals.some((proposal) => proposal.status === 'pending')) {
      rightTab.value = 'agent'
    }
  })
  await run(async () => {
    state.value = await window.chiyo.state()
  })
  window.addEventListener('keydown', shortcut)
})
onUnmounted(() => {
  unsubscribe?.()
  window.removeEventListener('keydown', shortcut)
})
</script>

<template>
  <div
    class="application"
    :class="{ 'resizing-sidebars': layout.resizing.value }"
    @contextmenu="
      openMenu($event, [
        pasteMenuItem(),
        {
          label: '撤销',
          shortcut: 'Ctrl+Z',
          disabled: !state?.canUndo || state?.busy,
          run: () => execute({ type: 'history.undo' }),
        },
        {
          label: '重做',
          shortcut: 'Ctrl+Y',
          disabled: !state?.canRedo || state?.busy,
          run: () => execute({ type: 'history.redo' }),
        },
        { label: '保存工程', shortcut: 'Ctrl+S', run: () => file('save') },
      ])
    "
  >
    <ContextMenu />
    <AppMenu
      @fit="canvas?.fit()"
      @zoom="canvas?.setZoom($event)"
      @export="canvas?.exportPage()"
      @layers="leftTab = 'layers'"
    />
    <div class="notification-stack">
      <div
        v-if="error"
        class="message-bar error"
        role="alert"
      >
        <span>{{ error }}</span
        ><button
          class="icon-button"
          aria-label="关闭错误"
          @click="error = ''"
        >
          <X :size="16" />
        </button>
      </div>
      <div
        v-if="notice"
        class="message-bar"
        role="status"
      >
        <span>{{ notice }}</span
        ><button
          class="icon-button"
          aria-label="关闭提示"
          @click="notice = ''"
        >
          <X :size="16" />
        </button>
      </div>
    </div>
    <main
      v-if="state && page"
      class="workbench"
      :class="{ busy: state.busy }"
      :style="layout.style.value"
    >
      <aside class="left-sidebar">
        <section class="pages-section">
          <div class="section-heading">
            <h2>页面</h2>
            <button
              class="icon-button"
              aria-label="添加页面"
              title="添加页面"
              :disabled="state.busy"
              @click="addPage"
            >
              <Plus :size="16" />
            </button>
          </div>
          <div class="page-strip">
            <button
              v-for="entry in state.project.pages"
              :key="entry.id"
              class="page-tile"
              :class="{ active: entry.id === page.id }"
              @click="execute({ type: 'page.select', id: entry.id })"
            >
              <svg
                viewBox="0 0 1200 1800"
                aria-hidden="true"
              >
                <rect
                  width="1200"
                  height="1800"
                  fill="white"
                />
                <svg
                  :viewBox="`0 0 ${entry.width} ${entry.height}`"
                  width="1200"
                  height="1800"
                >
                  <PanelClips
                    :panels="entry.layers.filter((item) => item.kind === 'panel')"
                    prefix="thumb-clip-"
                  />
                  <LayerArtwork
                    :layers="entry.layers"
                    clip-prefix="thumb-clip-"
                  />
                </svg></svg
              ><span>{{ entry.name }}</span>
            </button>
          </div>
        </section>
        <div class="panel-tabs">
          <button
            :class="{ active: leftTab === 'assets' }"
            @click="leftTab = 'assets'"
          >
            素材库</button
          ><button
            :class="{ active: leftTab === 'layers' }"
            @click="leftTab = 'layers'"
          >
            图层 <span class="tab-count">{{ page.layers.length }}</span>
          </button>
        </div>
        <div class="sidebar-scroll">
          <AssetLibrary v-if="leftTab === 'assets'" />
          <LayerTree v-else />
        </div>
      </aside>
      <div
        class="sidebar-resizer"
        role="separator"
        tabindex="0"
        aria-label="调整左侧栏宽度"
        aria-orientation="vertical"
        :aria-valuenow="layout.left.value"
        aria-valuemin="190"
        aria-valuemax="420"
        @pointerdown="layout.start($event, 'left')"
        @pointermove="layout.move"
        @pointerup="layout.end"
        @pointercancel="layout.end"
        @lostpointercapture="layout.end"
        @dblclick="layout.reset('left')"
        @keydown="layout.key($event, 'left')"
      />
      <section class="editor-area">
        <div class="canvas-toolbar">
          <div class="tool-group">
            <button
              v-for="entry in tools"
              :key="entry.id"
              class="icon-button tool-button"
              :class="{ active: (handActive ? 'hand' : tool) === entry.id }"
              :aria-pressed="(handActive ? 'hand' : tool) === entry.id"
              :title="entry.label"
              :aria-label="entry.label"
              :disabled="state.busy"
              @click="useTool(entry.id)"
            >
              <component
                :is="entry.icon"
                :size="18"
              />
            </button>
          </div>
          <div class="toolbar-divider" />
          <button
            class="icon-button"
            title="撤销 Ctrl+Z"
            aria-label="撤销"
            :disabled="!state.canUndo || state.busy"
            @click="execute({ type: 'history.undo' })"
          >
            <Undo2 :size="17" /></button
          ><button
            class="icon-button"
            title="重做 Ctrl+Y"
            aria-label="重做"
            :disabled="!state.canRedo || state.busy"
            @click="execute({ type: 'history.redo' })"
          >
            <Redo2 :size="17" />
          </button>
          <div class="toolbar-spacer" />
          <button
            class="icon-button"
            title="显示安全边距"
            aria-label="显示安全边距"
            :class="{ active: showGuides }"
            @click="showGuides = !showGuides"
          >
            <Frame :size="16" />
          </button>
        </div>
        <div class="canvas-caption">
          <span>{{ page.name }}</span
          ><span>{{ page.width }} × {{ page.height }} px</span
          ><button
            v-if="!page.layers.length"
            @click="template"
          >
            添加四格版式</button
          ><button @click="importAssets('artwork')">导入画稿</button>
        </div>
        <div
          v-if="tool === 'knife' || tool === 'nodes'"
          class="geometry-options"
        >
          <template v-if="tool === 'knife'"
            ><label
              >格间距
              <input
                v-model.number="splitGap"
                type="number"
                min="0"
                max="100"
                aria-label="切分格间距"
              />
              px</label
            ><span>拖过格框切分 · Shift 限制水平 / 垂直</span></template
          >
          <span v-else>选择格框或气泡后拖动节点 · Esc 退出</span>
        </div>
        <PageCanvas
          ref="canvas"
          v-model:zoom="zoom"
          v-model:tool="tool"
          :show-guides="showGuides"
          :split-gap="splitGap"
          @hand-active="handActive = $event"
        />
        <footer class="canvas-footer">
          <span>{{ state.busy ? 'Agent 正在执行…' : '就绪' }}</span
          ><span class="footer-version">版本 {{ state.project.revision }}</span>
          <span class="canvas-navigation-hint">滚轮缩放 · 空格 / 中键平移</span>
          <div class="zoom-controls">
            <button
              class="icon-button"
              aria-label="缩小"
              @click="canvas?.setZoom(zoom / 1.2)"
            >
              <ZoomOut :size="15" /></button
            ><input
              class="zoom-input"
              type="number"
              aria-label="画布缩放百分比"
              min="5"
              max="400"
              :value="Math.round(zoom * 100)"
              @change="canvas?.setZoom(Number(($event.target as HTMLInputElement).value) / 100)"
            /><span>%</span
            ><button
              class="icon-button"
              aria-label="放大"
              @click="canvas?.setZoom(zoom * 1.2)"
            >
              <ZoomIn :size="15" /></button
            ><button @click="canvas?.fit()">适合窗口</button>
          </div>
        </footer>
      </section>
      <div
        class="sidebar-resizer"
        role="separator"
        tabindex="0"
        aria-label="调整右侧栏宽度"
        aria-orientation="vertical"
        :aria-valuenow="layout.right.value"
        aria-valuemin="230"
        aria-valuemax="480"
        @pointerdown="layout.start($event, 'right')"
        @pointermove="layout.move"
        @pointerup="layout.end"
        @pointercancel="layout.end"
        @lostpointercapture="layout.end"
        @dblclick="layout.reset('right')"
        @keydown="layout.key($event, 'right')"
      />
      <aside class="right-sidebar">
        <div class="panel-tabs">
          <button
            :class="{ active: rightTab === 'properties' }"
            @click="rightTab = 'properties'"
          >
            属性</button
          ><button
            :class="{ active: rightTab === 'generation' }"
            @click="rightTab = 'generation'"
          >
            生图
          </button>
          <button
            :class="{ active: rightTab === 'agent' }"
            @click="rightTab = 'agent'"
          >
            AI 协作
            <span
              v-if="state.proposals.some((proposal) => proposal.status === 'pending')"
              class="pending-dot"
            />
          </button>
        </div>
        <div class="sidebar-scroll">
          <ObjectInspector v-if="rightTab === 'properties'" /><GenerationPanel
            v-else-if="rightTab === 'generation'"
          />
          <AgentPanel v-else />
        </div>
        <div class="connection-status"><span class="status-dot" />前台 MCP 已就绪</div>
      </aside>
    </main>
    <div
      v-else
      class="loading-state"
    >
      正在打开作品…
    </div>
  </div>
</template>

<style scoped lang="less">
.geometry-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  font-size: 12px;
  color: #acabb6;
}

.geometry-options label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.geometry-options input {
  width: 60px;
  padding: 3px 6px;
}
</style>
