<script setup lang="ts">
import { computed } from 'vue'
import type { Layer } from '../../../shared/model'
import { panelPoints } from '../../../shared/panel-geometry'
import BalloonVisual from './BalloonVisual.vue'
import { assetUrl } from '../editor'
const props = defineProps<{ layer: Layer }>()
const padding = computed(() =>
  props.layer.kind === 'balloon' ? 14 : Math.min(12, props.layer.fontSize * 0.25),
)
const lines = computed(() => {
  const count = Math.max(
    1,
    Math.floor((props.layer.width - padding.value * 2) / props.layer.fontSize),
  )
  return props.layer.text.split('\n').flatMap((paragraph) => {
    const characters = Array.from(paragraph)
    const result: string[] = []
    for (let index = 0; index < characters.length; index += count) {
      result.push(characters.slice(index, index + count).join(''))
    }
    return result.length ? result : ['']
  })
})
const strokePoints = computed(() => props.layer.points.map((point) => point.join(',')).join(' '))
</script>

<template>
  <g
    :transform="`translate(${layer.x} ${layer.y}) rotate(${layer.rotation} ${layer.width / 2} ${layer.height / 2})`"
    :opacity="layer.opacity"
  >
    <polygon
      v-if="layer.kind === 'panel'"
      :points="panelPoints(layer)"
      :fill="layer.fill"
      :stroke="layer.stroke"
      :stroke-width="layer.strokeWidth"
    />
    <image
      v-else-if="layer.kind === 'image' && layer.assetId"
      :href="assetUrl(layer.assetId)"
      :width="layer.width"
      :height="layer.height"
      preserveAspectRatio="xMidYMid slice"
    />
    <BalloonVisual
      v-else-if="layer.kind === 'balloon' && layer.balloonStyle"
      :layer="layer"
    />
    <template v-else-if="layer.kind === 'balloon'">
      <path
        :d="`M ${layer.width * 0.5} ${layer.height * 0.82} L ${layer.width * 0.64 + layer.tail} ${layer.height + Math.abs(layer.tail)} L ${layer.width * 0.7} ${layer.height * 0.8}`"
        :fill="layer.fill"
        :stroke="layer.stroke"
        :stroke-width="layer.strokeWidth"
      />
      <ellipse
        :cx="layer.width / 2"
        :cy="layer.height / 2"
        :rx="layer.width / 2"
        :ry="layer.height / 2"
        :fill="layer.fill"
        :stroke="layer.stroke"
        :stroke-width="layer.strokeWidth"
      />
    </template>
    <polyline
      v-else-if="layer.kind === 'stroke'"
      :points="strokePoints"
      fill="none"
      :stroke="layer.stroke"
      :stroke-width="layer.strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <template v-else-if="layer.kind === 'effect'">
      <defs
        ><pattern
          :id="`tone-${layer.id}`"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          ><circle
            cx="3"
            cy="3"
            r="2"
            :fill="layer.fill" /></pattern
      ></defs>
      <rect
        v-if="layer.effect === 'tone'"
        :width="layer.width"
        :height="layer.height"
        :fill="`url(#tone-${layer.id})`"
      />
      <g
        v-else-if="layer.effect === 'speed'"
        :stroke="layer.fill"
        :stroke-width="layer.strokeWidth"
      >
        <line
          v-for="index in 25"
          :key="index"
          :x1="(index % 4) * 15"
          :y1="(index * layer.height) / 26"
          :x2="layer.width"
          :y2="(index * layer.height) / 26"
        />
      </g>
      <g
        v-else
        :stroke="layer.fill"
        :stroke-width="layer.strokeWidth"
      >
        <line
          v-for="index in 50"
          :key="index"
          :x1="layer.width / 2 + Math.cos((index * Math.PI) / 25) * layer.width * 0.22"
          :y1="layer.height / 2 + Math.sin((index * Math.PI) / 25) * layer.height * 0.22"
          :x2="layer.width / 2 + (Math.cos((index * Math.PI) / 25) * layer.width) / 2"
          :y2="layer.height / 2 + (Math.sin((index * Math.PI) / 25) * layer.height) / 2"
        />
      </g>
    </template>
    <template v-if="layer.kind === 'text' || (layer.kind === 'balloon' && !layer.balloonStyle)">
      <text
        v-if="layer.vertical"
        :x="layer.width - layer.fontSize"
        y="20"
        :font-size="layer.fontSize"
        :fill="layer.stroke"
        writing-mode="vertical-rl"
        font-family="Microsoft YaHei, sans-serif"
        >{{ layer.text }}</text
      >
      <text
        v-else
        :font-size="layer.fontSize"
        :fill="layer.stroke"
        font-family="Microsoft YaHei, sans-serif"
        :text-anchor="layer.kind === 'balloon' ? 'middle' : 'start'"
      >
        <tspan
          v-for="(line, index) in lines"
          :key="index"
          :x="layer.kind === 'balloon' ? layer.width / 2 : padding"
          :y="
            layer.kind === 'balloon'
              ? (layer.height - lines.length * layer.fontSize * 1.4) / 2 +
                (index + 1) * layer.fontSize * 1.4
              : (index + 1) * layer.fontSize * 1.4
          "
          >{{ line }}</tspan
        >
      </text>
    </template>
  </g>
</template>
