<script setup lang="ts">
import { computed } from 'vue'
import type { Layer } from '../../../shared/model'
import { childrenOf } from '../../../shared/layers'
import LayerVisual from './LayerVisual.vue'

const props = withDefaults(
  defineProps<{
    layers: Layer[]
    folderId?: string | null
    clipPrefix: string
    interactive?: boolean
  }>(),
  { folderId: null, interactive: false },
)
const emit = defineEmits<{ down: [event: PointerEvent, layer: Layer] }>()
const children = computed(() => childrenOf(props.layers, props.folderId))
</script>

<template>
  <g
    v-for="layer in children"
    v-show="layer.visible"
    :key="layer.id"
    :data-layer="layer.id"
    :clip-path="layer.parentId ? `url(#${clipPrefix}${layer.parentId})` : undefined"
  >
    <g
      v-if="layer.kind === 'group'"
      :opacity="layer.opacity"
    >
      <LayerArtwork
        :layers="layers"
        :folder-id="layer.id"
        :clip-prefix="clipPrefix"
        :interactive="interactive"
        @down="(event, child) => emit('down', event, child)"
      />
    </g>
    <g
      v-else
      @pointerdown="emit('down', $event, layer)"
    >
      <LayerVisual :layer="layer" />
      <rect
        v-if="interactive && (layer.kind === 'text' || layer.kind === 'effect')"
        data-editor-only="true"
        :x="layer.x"
        :y="layer.y"
        :width="layer.width"
        :height="layer.height"
        :transform="`rotate(${layer.rotation} ${layer.x + layer.width / 2} ${layer.y + layer.height / 2})`"
        fill="transparent"
      />
    </g>
  </g>
</template>
