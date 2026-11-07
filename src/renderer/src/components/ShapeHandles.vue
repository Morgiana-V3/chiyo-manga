<script setup lang="ts">
import { computed } from 'vue'
import type { Layer } from '../../../shared/model'
import { shapeHandles, type ShapeHandle } from '../canvas-geometry'
const props = defineProps<{ layer: Layer; zoom: number }>()
defineEmits<{ down: [event: PointerEvent, handle: ShapeHandle] }>()
const handles = computed(() => shapeHandles(props.layer))
</script>
<template>
  <g
    data-editor-only="true"
    :transform="`translate(${layer.x} ${layer.y}) rotate(${layer.rotation} ${layer.width / 2} ${layer.height / 2})`"
  >
    <line
      v-for="(tail, i) in layer.tails ?? []"
      :key="i"
      :x1="tail.bend[0] * layer.width"
      :y1="tail.bend[1] * layer.height"
      :x2="tail.tip[0] * layer.width"
      :y2="tail.tip[1] * layer.height"
      stroke="#c16f88"
      :stroke-width="1 / zoom"
      :stroke-dasharray="`${4 / zoom} ${4 / zoom}`"
      pointer-events="none"
    />
    <circle
      v-for="handle in handles"
      :key="`${handle.kind}-${handle.index}`"
      :data-handle="`${handle.kind}-${handle.index}`"
      :aria-label="handle.label"
      :cx="handle.point[0] * layer.width"
      :cy="handle.point[1] * layer.height"
      :r="5 / zoom"
      :fill="handle.kind === 'bend' ? '#e9b269' : '#ffffff'"
      stroke="#b65374"
      :stroke-width="1.5 / zoom"
      style="cursor: move"
      @pointerdown.stop="$emit('down', $event, handle)"
      ><title>{{ handle.label }}</title></circle
    >
  </g>
</template>
