import { defaultTail } from '../../shared/balloon-geometry'
import { computed, ref } from 'vue'
import {
  activePage,
  makeLayer,
  type Action,
  type Asset,
  type HostState,
  type Layer,
  type ChiyoApi,
} from '../../shared/model'

export const state = ref<HostState>()
export const error = ref('')
export const notice = ref('')
export const page = computed(() => (state.value ? activePage(state.value.project) : undefined))
export const selected = computed(() =>
  page.value?.layers.find((layer) => layer.id === state.value?.project.selectedId),
)
let queue = Promise.resolve()

export async function run(task: () => Promise<unknown>): Promise<void> {
  error.value = ''
  try {
    await task()
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
        : String(failure)
  }
}
export function execute(action: Action): Promise<void> {
  queue = queue.then(() =>
    run(async () => {
      if (!state.value) {
        return
      }
      state.value = await window.chiyo.execute({
        action: JSON.parse(JSON.stringify(action)),
        expectedRevision: state.value.project.revision,
        operationId: crypto.randomUUID(),
      })
    }),
  )
  return queue
}
export function patchSelected(patch: Partial<Layer>): void {
  if (selected.value) {
    void execute({ type: 'layer.update', id: selected.value.id, patch })
  }
}
export function addLayer(kind: Layer['kind']): void {
  const patch: Partial<Layer> = {
    folderId: selected.value?.kind === 'group' ? selected.value.id : selected.value?.folderId,
  }
  if (kind === 'text' || kind === 'balloon') {
    patch.text = '在这里输入对白'
    patch.width = 250
    patch.height = 160
    patch.fontSize = 28
  }
  if (kind === 'balloon') {
    patch.balloonStyle = 'organic'
    patch.tails = [defaultTail()]
    patch.autoFit = true
    patch.textPadding = 14
  }
  if (kind === 'image') {
    return
  }
  if (kind === 'effect') {
    patch.fill = '#000000'
    patch.opacity = 0.25
  }
  void execute({ type: 'layer.add', layer: makeLayer(kind, patch) })
}
export function addFolder(): void {
  const count = page.value?.layers.filter((layer) => layer.kind === 'group').length ?? 0
  void execute({
    type: 'layer.add',
    layer: makeLayer('group', {
      name: `文件夹 ${count + 1}`,
      folderId: selected.value?.kind === 'group' ? selected.value.id : selected.value?.folderId,
    }),
  })
}
export async function file(command: Parameters<ChiyoApi['file']>[0]): Promise<void> {
  await queue
  await run(async () => {
    state.value = await window.chiyo.file(command)
  })
}
export async function importAssets(kind: Asset['kind'], familyId?: string): Promise<void> {
  await run(async () => {
    state.value = await window.chiyo.importAssets(kind, familyId)
  })
}
export function placeAsset(asset: Asset): void {
  const panel = selected.value?.kind === 'panel' ? selected.value : undefined
  const width = Math.min(700, asset.width)
  const layer = makeLayer('image', {
    name: asset.name,
    assetId: asset.id,
    x: panel?.x ?? 80,
    y: panel?.y ?? 80,
    width: panel?.width ?? width,
    height: panel?.height ?? (width * asset.height) / asset.width,
    parentId: panel?.id,
    folderId: selected.value?.kind === 'group' ? selected.value.id : selected.value?.folderId,
    referenceIds: asset.kind === 'artwork' ? [] : [asset.id],
    strokeWidth: 0,
  })
  void execute({ type: 'layer.add', layer })
}
export function bindReference(asset: Asset): void {
  if (!selected.value) {
    error.value = '请先选择需要参考素材的漫画格或画稿'
    return
  }
  patchSelected({ referenceIds: [...new Set([...selected.value.referenceIds, asset.id])] })
}
export function assetUrl(id: string): string {
  return `chiyo://asset/${id}`
}
