<script setup lang="ts">
import BalloonInspector from './BalloonInspector.vue'
import { computed } from 'vue'
import { ArrowUp, ArrowDown, Trash2, LockKeyhole, Copy, X } from 'lucide-vue-next'
import { type Layer } from '../../../shared/model'
import { state, page, selected, execute, patchSelected, assetUrl } from '../editor'
import { isLayerLocked, subtreeIds } from '../../../shared/layers'
import { copyLayer } from '../layer-clipboard'
const effectiveLocked = computed(() =>
  selected.value && page.value ? isLayerLocked(page.value.layers, selected.value) : false,
)
const folders = computed(() => {
  if (!page.value || !selected.value) {
    return []
  }
  const excluded = subtreeIds(page.value.layers, selected.value.id)
  return page.value.layers.filter((layer) => layer.kind === 'group' && !excluded.has(layer.id))
})
function moveToFolder(event: Event): void {
  if (selected.value) {
    void execute({
      type: 'layer.move',
      id: selected.value.id,
      targetId: (event.target as HTMLSelectElement).value || null,
      placement: 'inside',
    })
  }
}
const references = computed(
  () =>
    state.value?.project.assets.filter((asset) =>
      selected.value?.referenceIds.includes(asset.id),
    ) ?? [],
)
const panels = computed(() => page.value?.layers.filter((layer) => layer.kind === 'panel') ?? [])
function update(key: keyof Layer, event: Event, numeric = false): void {
  const input = event.target as HTMLInputElement
  patchSelected({ [key]: numeric ? Number(input.value) : input.value })
}
function pageUpdate(key: 'width' | 'height' | 'dpi' | 'margin' | 'name', event: Event): void {
  const value = (event.target as HTMLInputElement).value
  void execute({ type: 'page.update', patch: { [key]: key === 'name' ? value : Number(value) } })
}
function remove(): void {
  if (selected.value) {
    void execute({ type: 'layer.remove', id: selected.value.id })
  }
}
function order(direction: 'up' | 'down'): void {
  if (selected.value) {
    void execute({ type: 'layer.order', id: selected.value.id, direction })
  }
}
function crop(event: Event): void {
  const id = (event.target as HTMLSelectElement).value
  patchSelected({ parentId: id || null })
}
</script>

<template>
  <section
    v-if="selected"
    class="inspector"
  >
    <div class="section-heading">
      <h2>对象属性</h2>
      <span class="muted">{{ selected.kind === 'panel' ? '漫画格' : selected.name }}</span>
    </div>
    <label
      >名称<input
        :value="selected.name"
        :disabled="effectiveLocked || state?.busy"
        @change="update('name', $event)"
    /></label>
    <div class="button-row compact">
      <button
        title="向上一层"
        aria-label="向上一层"
        @click="order('up')"
      >
        <ArrowUp :size="15" /></button
      ><button
        title="向下一层"
        aria-label="向下一层"
        @click="order('down')"
      >
        <ArrowDown :size="15" /></button
      ><button
        title="复制图层 Ctrl+C"
        aria-label="复制图层"
        @click="copyLayer()"
      >
        <Copy :size="15" /></button
      ><button
        :class="{ active: selected.locked }"
        title="锁定或解锁"
        aria-label="锁定或解锁"
        @click="patchSelected({ locked: !selected.locked })"
      >
        <LockKeyhole :size="15" /></button
      ><button
        title="删除对象"
        aria-label="删除对象"
        :disabled="effectiveLocked || state?.busy"
        @click="remove"
      >
        <Trash2 :size="15" />
      </button>
    </div>
    <label
      >所属文件夹<select
        :value="selected.folderId ?? ''"
        :disabled="effectiveLocked || state?.busy"
        @change="moveToFolder"
      >
        <option value="">页面根目录</option>
        <option
          v-for="folder in folders"
          :key="folder.id"
          :value="folder.id"
        >
          {{ folder.name }}
        </option>
      </select></label
    >
    <template v-if="selected.kind === 'group'">
      <p class="muted">文件夹的显隐与锁定会作用于其中的所有图层。</p>
      <button
        class="full-width"
        :disabled="effectiveLocked || state?.busy"
        @click="execute({ type: 'layer.ungroup', id: selected.id })"
      >
        解除分组，保留内容
      </button>
    </template>
    <fieldset
      v-else
      :disabled="effectiveLocked || state?.busy"
    >
      <div class="field-grid">
        <label
          >X<input
            type="number"
            :value="Math.round(selected.x)"
            @change="update('x', $event, true)" /></label
        ><label
          >Y<input
            type="number"
            :value="Math.round(selected.y)"
            @change="update('y', $event, true)" /></label
        ><label
          >宽度<input
            type="number"
            min="8"
            :value="Math.round(selected.width)"
            @change="update('width', $event, true)" /></label
        ><label
          >高度<input
            type="number"
            min="8"
            :value="Math.round(selected.height)"
            @change="update('height', $event, true)" /></label
        ><label
          >旋转<input
            type="number"
            min="-360"
            max="360"
            :value="selected.rotation"
            @change="update('rotation', $event, true)" /></label
        ><label
          >不透明度<input
            type="number"
            min="0"
            max="1"
            step="0.05"
            :value="selected.opacity"
            @change="update('opacity', $event, true)"
        /></label>
      </div>
      <div class="field-grid">
        <label
          >线条颜色<input
            type="color"
            :value="selected.stroke"
            @change="update('stroke', $event)" /></label
        ><label
          >线宽<input
            type="number"
            min="0"
            max="40"
            :value="selected.strokeWidth"
            @change="update('strokeWidth', $event, true)"
        /></label>
      </div>
      <label v-if="['panel', 'balloon', 'effect'].includes(selected.kind)"
        >填充颜色<input
          type="color"
          :value="selected.fill"
          @change="update('fill', $event)"
      /></label>
      <label v-if="selected.kind === 'panel'"
        >格框<select
          :value="selected.shape"
          @change="update('shape', $event)"
        >
          <option value="rectangle">矩形</option>
          <option
            v-if="selected.shape === 'polygon'"
            value="polygon"
          >
            自定义多边形
          </option>
          <option value="slant">斜格</option>
        </select></label
      >
      <label v-if="selected.kind === 'effect'"
        >效果<select
          :value="selected.effect"
          @change="update('effect', $event)"
        >
          <option value="tone">网点</option>
          <option value="speed">速度线</option>
          <option value="focus">集中线</option>
        </select></label
      >
      <template v-if="selected.kind === 'text' || selected.kind === 'balloon'">
        <label
          >文字<textarea
            :value="selected.text"
            rows="4"
            @change="update('text', $event)"
          />
        </label>
        <div class="field-grid">
          <label
            >字号<input
              type="number"
              min="8"
              max="300"
              :value="selected.fontSize"
              @change="update('fontSize', $event, true)" /></label
          ><label
            >排版<select
              :value="selected.vertical ? 'vertical' : 'horizontal'"
              @change="
                patchSelected({
                  vertical: ($event.target as HTMLSelectElement).value === 'vertical',
                })
              "
            >
              <option value="horizontal">横排</option>
              <option value="vertical">竖排</option>
            </select></label
          >
        </div>
        <BalloonInspector
          v-if="selected.kind === 'balloon'"
          :layer="selected"
        />
        <label v-if="selected.kind === 'balloon' && !selected.balloonStyle"
          >气泡尾巴<input
            type="range"
            min="-150"
            max="150"
            :value="selected.tail"
            @change="update('tail', $event, true)"
        /></label>
      </template>
      <label v-if="selected.kind !== 'panel'"
        >裁切到漫画格<select
          :value="selected.parentId ?? ''"
          @change="crop"
        >
          <option value="">不裁切 / 允许出格</option>
          <option
            v-for="panel in panels"
            :key="panel.id"
            :value="panel.id"
          >
            {{ panel.name }}
          </option>
        </select></label
      >
      <div class="section-heading subsection">
        <h3>参考素材</h3>
        <span class="muted">{{ references.length }}</span>
      </div>
      <p
        v-if="!references.length"
        class="muted"
      >
        从素材库选择图片并绑定参考。
      </p>
      <div
        v-for="asset in references"
        :key="asset.id"
        class="reference-row"
      >
        <img
          :src="assetUrl(asset.id)"
          :alt="asset.name"
        /><span
          >{{ asset.name
          }}<small>v{{ asset.version }} · {{ asset.adopted ? '采用版' : '候选版' }}</small></span
        ><button
          class="icon-button"
          aria-label="解除参考绑定"
          @click="
            patchSelected({ referenceIds: selected.referenceIds.filter((id) => id !== asset.id) })
          "
        >
          <X :size="12" />
        </button>
      </div>
      <label
        >画面描述<textarea
          :value="selected.prompt"
          rows="3"
          placeholder="动作、表情、构图与本格状态"
          @change="update('prompt', $event)"
        />
      </label>
      <label
        >修改要求<textarea
          :value="selected.notes"
          rows="2"
          placeholder="需要保留与调整的部分"
          @change="update('notes', $event)"
        />
      </label>
    </fieldset>
  </section>
  <section
    v-else-if="page"
    class="inspector"
  >
    <div class="section-heading"><h2>页面设置</h2></div>
    <label
      >页面名称<input
        :value="page.name"
        @change="pageUpdate('name', $event)"
    /></label>
    <div class="field-grid">
      <label
        >宽度 · px<input
          type="number"
          min="256"
          max="6000"
          :value="page.width"
          @change="pageUpdate('width', $event)" /></label
      ><label
        >高度 · px<input
          type="number"
          min="256"
          max="6000"
          :value="page.height"
          @change="pageUpdate('height', $event)" /></label
      ><label
        >DPI<input
          type="number"
          min="72"
          max="1200"
          :value="page.dpi"
          @change="pageUpdate('dpi', $event)" /></label
      ><label
        >安全边距 · px<input
          type="number"
          min="0"
          max="300"
          :value="page.margin"
          @change="pageUpdate('margin', $event)"
      /></label>
    </div>
    <div class="page-summary">
      <span>{{ page.layers.filter((layer) => layer.kind === 'panel').length }} 个漫画格</span
      ><span>{{ page.layers.length }} 个对象</span>
    </div>
  </section>
</template>
