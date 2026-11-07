import { computed, shallowRef, watch } from 'vue'
import { activePage, type Project } from '../../shared/model'
import { captureLayer, createPasteAction, type LayerCopy } from '../../shared/layer-copy'
import { state, selected, execute, run, notice } from './editor'

const clipboard = shallowRef<LayerCopy>()
export const canPasteLayers = computed(
  () => !!clipboard.value && clipboard.value.projectId === state.value?.project.id,
)
watch(
  () => state.value?.project.id,
  (id, previous) => {
    if (previous && id !== previous) {
      clipboard.value = undefined
    }
  },
)

export function copyLayer(id = selected.value?.id): void {
  if (!id || !state.value || state.value.busy) {
    return
  }
  void run(async () => {
    clipboard.value = captureLayer(JSON.parse(JSON.stringify(state.value!.project)), id)
    const root = clipboard.value.layers.find((layer) => layer.id === id)!
    notice.value = `已复制「${root.name}」；切换页面后按 Ctrl+V 粘贴`
  })
}

export async function pasteLayers(folderId: string | null = null): Promise<void> {
  if (!clipboard.value || !canPasteLayers.value || state.value?.busy) {
    return
  }
  await execute(createPasteAction(clipboard.value, folderId))
  notice.value = ''
}

export async function duplicateLayer(id = selected.value?.id): Promise<void> {
  if (!id || !state.value || state.value.busy) {
    return
  }
  const project: Project = JSON.parse(JSON.stringify(state.value.project))
  const source = activePage(project).layers.find((layer) => layer.id === id)
  await run(async () => {
    const copy = captureLayer(project, id, false)
    await execute(createPasteAction(copy, source?.folderId ?? null, true))
  })
}
