<script setup lang="ts">
import { computed } from 'vue'
import type { Layer } from '../../../shared/model'
import {
  balloonStyles,
  balloonPath,
  defaultTail,
  outlineNodes,
} from '../../../shared/balloon-geometry'
import { patchSelected } from '../editor'
import { layoutBalloonText } from '../balloon-text'
const props = defineProps<{ layer: Layer }>()
const overflow = computed(
  () =>
    layoutBalloonText(props.layer).overflow ||
    (props.layer.lobes ?? []).some(
      (lobe) =>
        layoutBalloonText(
          props.layer,
          lobe.width * props.layer.width,
          lobe.height * props.layer.height,
          lobe.text,
        ).overflow,
    ),
)
function editNodes(): void {
  window.chiyoSetView({ tool: 'nodes' })
}
function style(value: Layer['balloonStyle']): void {
  patchSelected({
    balloonStyle: value,
    tails: value === 'caption' ? [] : (props.layer.tails ?? [defaultTail()]),
    outline: outlineNodes({ ...props.layer, balloonStyle: value, outline: undefined }),
    textPadding: props.layer.textPadding ?? 14,
    autoFit: props.layer.autoFit ?? true,
  })
}
function lobeText(index: number, event: Event): void {
  const lobes = JSON.parse(JSON.stringify(props.layer.lobes ?? [])) as NonNullable<Layer['lobes']>
  lobes[index].text = (event.target as HTMLTextAreaElement).value
  patchSelected({ lobes })
}
function tailWidth(index: number, event: Event): void {
  const tails = JSON.parse(JSON.stringify(props.layer.tails ?? [])) as NonNullable<Layer['tails']>
  tails[index].width = Number((event.target as HTMLInputElement).value)
  patchSelected({ tails })
}
</script>
<template>
  <div class="balloon-settings">
    <div class="section-heading subsection"><h3>气泡样式</h3></div>
    <div class="balloon-presets">
      <button
        v-for="(label, key) in balloonStyles"
        :key="key"
        :class="{ active: layer.balloonStyle === key }"
        :title="label"
        @click="style(key)"
      >
        <svg
          viewBox="-8 -8 116 86"
          aria-hidden="true"
        >
          <path
            :d="
              balloonPath({
                ...layer,
                width: 100,
                height: 70,
                balloonStyle: key,
                tails: [],
                lobes: [],
                outline: undefined,
              })
            "
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            :stroke-dasharray="key === 'whisper' ? '5 4' : undefined"
          /></svg
        >{{ label }}
      </button>
    </div>
    <template v-if="layer.balloonStyle">
      <button
        class="full-width"
        @click="editNodes"
      >
        编辑轮廓与尾巴 · N
      </button>
      <p class="muted">白点调整轮廓或尾尖，金色点控制尾巴弯曲。</p>
      <div
        v-for="(tail, index) in layer.tails ?? []"
        :key="index"
        class="balloon-tail-row"
      >
        <label
          >尾巴 {{ index + 1 }} 宽度<input
            type="range"
            min="0.02"
            max="0.6"
            step="0.01"
            :value="tail.width"
            @change="tailWidth(index, $event)"
        /></label>
        <button @click="patchSelected({ tails: layer.tails?.filter((_, i) => i !== index) })">
          移除
        </button>
      </div>
      <div class="button-row">
        <button
          :disabled="(layer.tails?.length ?? 0) >= 4"
          @click="patchSelected({ tails: [...(layer.tails ?? []), defaultTail()] })"
        >
          添加尾巴
        </button>
        <button
          :disabled="(layer.lobes?.length ?? 0) >= 3"
          @click="
            patchSelected({
              lobes: [
                ...(layer.lobes ?? []),
                { x: 0.55, y: 0.55, width: 0.9, height: 0.85, text: '接着说…' },
              ],
            })
          "
        >
          添加连体气泡
        </button>
      </div>
      <div
        v-for="(lobe, index) in layer.lobes ?? []"
        :key="index"
      >
        <label
          >连体对白 {{ index + 1
          }}<textarea
            :value="lobe.text"
            rows="2"
            @change="lobeText(index, $event)"
          />
        </label>
        <button @click="patchSelected({ lobes: layer.lobes?.filter((_, i) => i !== index) })">
          移除此连体
        </button>
      </div>
      <label
        >文字边距 · px<input
          type="number"
          min="0"
          max="100"
          :value="layer.textPadding ?? 14"
          @change="
            patchSelected({ textPadding: Number(($event.target as HTMLInputElement).value) })
          "
      /></label>
      <label
        ><input
          type="checkbox"
          :checked="layer.autoFit !== false"
          @change="patchSelected({ autoFit: ($event.target as HTMLInputElement).checked })"
        />自动缩小字号以容纳对白</label
      >
      <p
        v-if="overflow"
        role="status"
        class="text-overflow-warning"
      >
        对白超出气泡：请扩大气泡或精简文字。导出会裁掉溢出部分，原文仍保留。
      </p>
    </template>
    <p
      v-else
      class="muted"
    >
      当前保留旧版气泡。选择样式后可编辑轮廓与尾巴。
    </p>
  </div>
</template>
<style scoped lang="less">
.balloon-presets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 10px;
}

.balloon-presets button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px;
}

.balloon-presets svg {
  width: 55px;
  height: 40px;
}

.balloon-tail-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.balloon-tail-row label {
  flex: 1;
  min-width: 0;
}

.text-overflow-warning {
  color: #e9b269;
  font-size: 12px;
}
</style>
