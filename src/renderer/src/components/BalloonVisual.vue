<script setup lang="ts">
import { computed, useId } from 'vue'
import type { Layer } from '../../../shared/model'
import { balloonPath } from '../../../shared/balloon-geometry'
import { layoutBalloonText } from '../balloon-text'
const props = defineProps<{ layer: Layer }>()
const id = useId().replaceAll(':', '')
const path = computed(() => balloonPath(props.layer))
const body = computed(() => balloonPath(props.layer, false))
const blocks = computed(() => [
  { x: 0, y: 0, layout: layoutBalloonText(props.layer) },
  ...(props.layer.lobes ?? []).map((lobe) => ({
    x: lobe.x * props.layer.width,
    y: lobe.y * props.layer.height,
    layout: layoutBalloonText(
      props.layer,
      lobe.width * props.layer.width,
      lobe.height * props.layer.height,
      lobe.text,
    ),
  })),
])
</script>
<template>
  <g>
    <path
      :d="path"
      :fill="layer.fill"
      :stroke="layer.stroke"
      :stroke-width="layer.strokeWidth"
      :stroke-dasharray="layer.balloonStyle === 'whisper' ? '7 5' : undefined"
      stroke-linejoin="round"
      fill-rule="evenodd"
    />
    <defs
      ><clipPath :id="`balloon-${id}`"><path :d="body" /></clipPath
    ></defs>
    <g :clip-path="`url(#balloon-${id})`">
      <g
        v-for="(block, index) in blocks"
        :key="index"
        :transform="`translate(${block.x} ${block.y})`"
        :data-text-overflow="block.layout.overflow || undefined"
      >
        <text
          v-for="(line, i) in block.layout.lines"
          :key="i"
          :x="
            layer.vertical
              ? block.layout.width / 2 +
                ((block.layout.lines.length - 1) * block.layout.lineHeight) / 2 -
                i * block.layout.lineHeight
              : block.layout.width / 2
          "
          :y="
            layer.vertical
              ? block.layout.top
              : (block.layout.height - block.layout.lines.length * block.layout.lineHeight) / 2 +
                (i + 0.8) * block.layout.lineHeight
          "
          :font-size="block.layout.size"
          :fill="layer.stroke"
          :writing-mode="layer.vertical ? 'vertical-rl' : undefined"
          :text-anchor="layer.vertical ? 'start' : 'middle'"
          font-family="Microsoft YaHei, sans-serif"
          >{{ line }}</text
        >
      </g>
    </g>
  </g>
</template>
