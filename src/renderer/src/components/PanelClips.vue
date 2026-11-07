<script setup lang="ts">
import { panelPoints } from '../../../shared/panel-geometry'
import type { Layer } from '../../../shared/model'
defineProps<{ panels: Layer[]; prefix: string }>()
</script>

<template>
  <defs>
    <clipPath
      v-for="panel in panels"
      :id="`${prefix}${panel.id}`"
      :key="panel.id"
      clipPathUnits="userSpaceOnUse"
      :transform="`rotate(${panel.rotation} ${panel.x + panel.width / 2} ${panel.y + panel.height / 2})`"
    >
      <polygon :points="panelPoints(panel, true)" />
    </clipPath>
  </defs>
</template>
