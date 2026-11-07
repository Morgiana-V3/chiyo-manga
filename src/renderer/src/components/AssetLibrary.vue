<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Search, Check, ImagePlus, Link, X } from 'lucide-vue-next'
import { assetKinds, assetLabels, type Asset } from '../../../shared/model'
import {
  state,
  selected,
  importAssets,
  assetUrl,
  placeAsset,
  bindReference,
  execute,
} from '../editor'
import { openMenu } from '../context-menu'
function menu(event: MouseEvent, asset: Asset): void {
  inspectedId.value = asset.id
  openMenu(event, [
    { label: '放入当前页面', disabled: state.value?.busy, run: () => placeAsset(asset) },
    {
      label: '绑定为参考素材',
      disabled: !selected.value || state.value?.busy,
      run: () => bindReference(asset),
    },
    {
      label: '采用这个版本',
      disabled: asset.adopted || state.value?.busy,
      run: () => execute({ type: 'asset.update', id: asset.id, patch: { adopted: true } }),
    },
  ])
}
const filter = ref<Asset['kind'] | 'all'>('all')
const query = ref('')
const inspectedId = ref<string>()
const inspected = computed(() =>
  state.value?.project.assets.find((asset) => asset.id === inspectedId.value),
)
const assets = computed(
  () =>
    state.value?.project.assets.filter(
      (asset) =>
        (filter.value === 'all' || asset.kind === filter.value) &&
        `${asset.name} ${asset.notes}`.toLowerCase().includes(query.value.toLowerCase()),
    ) ?? [],
)
function updateAsset(key: 'name' | 'notes' | 'kind', event: Event): void {
  if (!inspected.value) {
    return
  }
  const value = (event.target as HTMLInputElement).value
  void execute({ type: 'asset.update', id: inspected.value.id, patch: { [key]: value } })
}
function adopt(): void {
  if (inspected.value) {
    void execute({ type: 'asset.update', id: inspected.value.id, patch: { adopted: true } })
  }
}
function importSelected(): void {
  void importAssets(filter.value === 'all' ? 'character' : filter.value)
}
</script>

<template>
  <section class="asset-library">
    <div class="section-heading">
      <h2>素材库</h2>
      <button
        class="icon-button"
        title="导入素材"
        aria-label="导入素材"
        :disabled="state?.busy"
        @click="importSelected"
      >
        <Plus :size="16" />
      </button>
    </div>
    <div class="search-field">
      <Search :size="14" /><input
        v-model="query"
        placeholder="搜索素材"
        aria-label="搜索素材"
      />
    </div>
    <select
      v-model="filter"
      aria-label="素材分类"
      class="full-width"
    >
      <option value="all">全部素材</option>
      <option
        v-for="kind in assetKinds"
        :key="kind"
        :value="kind"
      >
        {{ assetLabels[kind] }}
      </option>
    </select>
    <div
      v-if="!assets.length"
      class="empty-state"
    >
      <ImagePlus :size="28" />
      <p>{{ query ? '没有匹配的素材' : '暂无参考素材' }}</p>
      <button
        v-if="!query"
        @click="importSelected"
      >
        导入图片
      </button>
    </div>
    <div class="asset-grid">
      <button
        v-for="asset in assets"
        :key="asset.id"
        class="asset-tile"
        :class="{ active: inspectedId === asset.id }"
        :title="`${asset.name} · v${asset.version}`"
        @click="inspectedId = asset.id"
        @dblclick="placeAsset(asset)"
        @contextmenu="menu($event, asset)"
      >
        <img
          :src="assetUrl(asset.id)"
          :alt="asset.name"
          loading="lazy"
        />
        <span class="asset-name">{{ asset.name }}</span
        ><span class="asset-version"
          ><Check
            v-if="asset.adopted"
            :size="11"
          />v{{ asset.version }} · {{ assetLabels[asset.kind] }}</span
        >
      </button>
    </div>
    <div
      v-if="inspected"
      class="asset-details"
    >
      <div class="section-heading">
        <h3>素材详情</h3>
        <button
          class="icon-button"
          aria-label="关闭素材详情"
          @click="inspectedId = undefined"
        >
          <X :size="14" />
        </button>
      </div>
      <img
        class="asset-preview"
        :src="assetUrl(inspected.id)"
        :alt="inspected.name"
      />
      <label
        >名称<input
          :value="inspected.name"
          maxlength="200"
          @change="updateAsset('name', $event)"
      /></label>
      <label
        >分类<select
          :value="inspected.kind"
          @change="updateAsset('kind', $event)"
        >
          <option
            v-for="kind in assetKinds"
            :key="kind"
            :value="kind"
          >
            {{ assetLabels[kind] }}
          </option>
        </select></label
      >
      <label
        >设定与辨识特征<textarea
          :value="inspected.notes"
          rows="3"
          placeholder="例如：左侧矩形发夹、齐肩直发"
          @change="updateAsset('notes', $event)"
        />
      </label>
      <p class="muted">
        {{ inspected.width }} × {{ inspected.height }} · v{{ inspected.version }} ·
        {{ inspected.adopted ? '采用版' : '候选版' }}
      </p>
      <div class="button-row">
        <button @click="placeAsset(inspected)"><ImagePlus :size="14" />放入画布</button
        ><button @click="bindReference(inspected)"><Link :size="14" />绑定参考</button>
      </div>
      <button
        v-if="!inspected.adopted"
        class="full-width"
        @click="adopt"
      >
        设为采用版
      </button>
      <details>
        <summary>版本与来源</summary>
        <button
          class="full-width"
          :disabled="state?.busy"
          @click="importAssets(inspected.kind, inspected.id)"
        >
          导入新版本
        </button>
        <p class="source-text">{{ inspected.provenance }}</p>
        <p class="muted">{{ inspected.sourceName }}</p>
      </details>
    </div>
  </section>
</template>
