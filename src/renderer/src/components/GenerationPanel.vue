<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { WandSparkles, RefreshCw, ImagePlus } from 'lucide-vue-next'
import { generationInputSchema, type GenerationInput } from '../../../shared/model'
import { state, selected, run, placeAsset, assetUrl, execute } from '../editor'

const input = reactive<GenerationInput>(
  generationInputSchema.parse({
    prompt: 'monochrome, greyscale, manga, clean lineart, screentone, ',
  }),
)
const status = ref('')
const checking = ref(false)
const inpaint = ref(false)
const region = reactive({ x: 0, y: 0, width: 256, height: 256 })
const generatedAssets = computed(
  () =>
    state.value?.project.assets.filter((asset) =>
      state.value?.project.generations.some((record) => record.resultAssetId === asset.id),
    ) ?? [],
)
const referenceCount = computed(() => selected.value?.referenceIds.length ?? 0)
async function check(): Promise<void> {
  checking.value = true
  await run(async () => {
    status.value = JSON.stringify(await window.chiyo.providerStatus(), null, 2)
  })
  checking.value = false
}
function useDescription(): void {
  if (selected.value?.prompt) {
    input.prompt = selected.value.prompt
  }
}
async function generate(): Promise<void> {
  await run(async () => {
    if (!state.value) {
      return
    }
    const request: GenerationInput = {
      ...input,
      targetLayerId: selected.value?.id,
      referenceIds: selected.value?.referenceIds ?? [],
      sourceAssetId: inpaint.value ? input.sourceAssetId : undefined,
      rectangles: inpaint.value ? [{ ...region }] : [],
    }
    state.value = await window.chiyo.generate(
      JSON.parse(JSON.stringify(request)),
      state.value.project.revision,
      crypto.randomUUID(),
    )
  })
}
async function recover(id: string): Promise<void> {
  await run(async () => {
    state.value = await window.chiyo.recoverGeneration(id)
  })
}
function adopt(assetId: string, targetLayerId?: string): void {
  const asset = state.value?.project.assets.find((entry) => entry.id === assetId)
  if (!asset) {
    return
  }
  const target = state.value?.project.pages
    .flatMap((entry) => entry.layers)
    .find((layer) => layer.id === targetLayerId)
  if (target?.kind === 'image') {
    void execute({ type: 'layer.update', id: target.id, patch: { assetId, name: asset.name } })
  } else {
    placeAsset(asset)
  }
}
</script>

<template>
  <section class="generation-panel">
    <div class="section-heading">
      <h2>NovelAI 生图</h2>
      <button
        class="icon-button"
        aria-label="检查 NovelPrompt 连接和余额"
        title="检查连接和余额"
        :disabled="checking"
        @click="check"
      >
        <RefreshCw :size="15" />
      </button>
    </div>
    <p class="muted provider-caption">使用当前 NovelPrompt 开发实例的配置与额度。</p>
    <details v-if="status">
      <summary>连接与余额</summary>
      <pre class="provider-status">{{ status }}</pre>
    </details>
    <div class="button-row">
      <button
        :class="{ active: !inpaint }"
        @click="inpaint = false"
      >
        生成画稿</button
      ><button
        :class="{ active: inpaint }"
        @click="inpaint = true"
      >
        局部重绘
      </button>
    </div>
    <label v-if="inpaint"
      >原图<select v-model="input.sourceAssetId">
        <option :value="undefined">选择生成的画稿</option>
        <option
          v-for="asset in generatedAssets"
          :key="asset.id"
          :value="asset.id"
        >
          {{ asset.name }} · v{{ asset.version }}
        </option>
      </select></label
    >
    <template v-if="inpaint"
      ><p class="muted">重绘选区 · 原图像素坐标</p>
      <div class="field-grid">
        <label
          >X<input
            v-model.number="region.x"
            type="number"
            min="0" /></label
        ><label
          >Y<input
            v-model.number="region.y"
            type="number"
            min="0" /></label
        ><label
          >宽<input
            v-model.number="region.width"
            type="number"
            min="1" /></label
        ><label
          >高<input
            v-model.number="region.height"
            type="number"
            min="1"
        /></label>
      </div>
      <label
        >重绘强度<input
          v-model.number="input.strength"
          type="number"
          min=".01"
          max="1"
          step=".05" /></label
    ></template>
    <label
      >提示词<textarea
        v-model="input.prompt"
        rows="5"
      /></label
    ><button
      v-if="selected?.prompt"
      class="full-width"
      @click="useDescription"
    >
      使用所选对象的画面描述
    </button>
    <label
      >负面提示词<textarea
        v-model="input.negative"
        rows="2"
      />
    </label>
    <div class="field-grid">
      <label
        >模型<select v-model="input.version">
          <option value="v5">NovelAI V5</option>
          <option value="v4.5">NovelAI V4.5</option>
        </select></label
      ><label
        >步数<input
          v-model.number="input.steps"
          type="number"
          min="1"
          max="28" /></label
      ><label v-if="!inpaint"
        >宽度<input
          v-model.number="input.width"
          type="number"
          min="64"
          max="2048"
          step="64" /></label
      ><label v-if="!inpaint"
        >高度<input
          v-model.number="input.height"
          type="number"
          min="64"
          max="2048"
          step="64"
      /></label>
    </div>
    <p
      v-if="referenceCount"
      class="reference-warning"
    >
      已绑定
      {{ referenceCount }}
      份参考。当前宿主接口只接收提示词，不传参考图片；绑定本身不能保证角色一致。
    </p>
    <label
      v-if="referenceCount"
      class="checkbox-label"
      ><input
        v-model="input.acknowledgeTextOnly"
        type="checkbox"
      />本次仅传提示词，参考供 Agent 看图编排</label
    >
    <button
      class="primary full-width"
      :disabled="
        state?.busy || !input.prompt.trim() || (referenceCount > 0 && !input.acknowledgeTextOnly)
      "
      @click="generate"
    >
      <WandSparkles :size="15" />{{ state?.busy ? '正在执行…' : '生成一张' }}
    </button>
    <p class="muted provider-caption">可能消耗 Anlas，以当前宿主权限和实际余额为准。</p>
    <div
      v-for="record in [...(state?.project.generations ?? [])].reverse()"
      :key="record.id"
      class="generation-result"
    >
      <img
        v-if="record.resultAssetId"
        :src="assetUrl(record.resultAssetId)"
        alt="生成候选画稿"
      />
      <p>{{ record.message }}</p>
      <small class="operation-id">{{ record.id }}</small
      ><button
        v-if="record.resultAssetId"
        class="full-width"
        @click="adopt(record.resultAssetId, record.input.targetLayerId)"
      >
        <ImagePlus :size="14" />采用到画布</button
      ><button
        v-if="record.status === 'unknown'"
        class="full-width"
        @click="recover(record.id)"
      >
        查询原操作，不重试
      </button>
      <details v-if="record.receipt">
        <summary>执行回执</summary>
        <pre class="provider-status">{{ record.receipt }}</pre>
      </details>
    </div>
  </section>
</template>
