import { shallowRef, ref } from 'vue'
import { type Layer } from '../../shared/model'
import { isLayerLocked } from '../../shared/layers'
import { canPasteLayers, copyLayer, pasteLayers, duplicateLayer } from './layer-clipboard'
import { state, page, execute, addFolder } from './editor'

export interface MenuItem {
  label: string
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  run: () => unknown
}
export const contextMenu = shallowRef<{ x: number; y: number; items: MenuItem[] }>()
export const renameRequest = ref<string>()
export function openMenu(event: MouseEvent, items: MenuItem[]): void {
  event.preventDefault()
  event.stopPropagation()
  contextMenu.value = { x: event.clientX, y: event.clientY, items }
}
export function layerMenu(layer: Layer): MenuItem[] {
  const disabled = !!state.value?.busy || isLayerLocked(page.value?.layers ?? [], layer)
  const update = (patch: Partial<Layer>) => execute({ type: 'layer.update', id: layer.id, patch })
  return [
    {
      label: '重命名',
      shortcut: 'F2',
      disabled,
      run: () => {
        renameRequest.value = layer.id
      },
    },
    {
      label: '复制图层',
      shortcut: 'Ctrl+C',
      disabled: !!state.value?.busy,
      run: () => copyLayer(layer.id),
    },
    { label: '创建副本', shortcut: 'Ctrl+D', disabled, run: () => duplicateLayer(layer.id) },
    pasteMenuItem(),
    ...(layer.kind === 'group'
      ? [
          {
            label: '粘贴到此文件夹',
            disabled: disabled || !canPasteLayers.value,
            run: () => pasteLayers(layer.id),
          },
          {
            label: '解除分组，保留内容',
            disabled,
            run: () => execute({ type: 'layer.ungroup', id: layer.id }),
          },
        ]
      : []),
    {
      label: '上移一层',
      disabled,
      run: () => execute({ type: 'layer.order', id: layer.id, direction: 'up' }),
    },
    {
      label: '下移一层',
      disabled,
      run: () => execute({ type: 'layer.order', id: layer.id, direction: 'down' }),
    },
    {
      label: '移到页面根目录',
      disabled: disabled || !layer.folderId,
      run: () => execute({ type: 'layer.move', id: layer.id, targetId: null, placement: 'inside' }),
    },
    {
      label: layer.visible ? '隐藏图层' : '显示图层',
      disabled: !!state.value?.busy,
      run: () => update({ visible: !layer.visible }),
    },
    {
      label: layer.locked ? '解锁图层' : '锁定图层',
      disabled: !!state.value?.busy,
      run: () => update({ locked: !layer.locked }),
    },
    {
      label: layer.kind === 'group' ? '删除文件夹及内容' : '删除图层',
      shortcut: 'Del',
      danger: true,
      disabled,
      run: () => execute({ type: 'layer.remove', id: layer.id }),
    },
  ]
}
export function pasteMenuItem(): MenuItem {
  return {
    label: '粘贴图层',
    shortcut: 'Ctrl+V',
    disabled: !canPasteLayers.value || !!state.value?.busy,
    run: () => pasteLayers(),
  }
}
export function folderMenu(): MenuItem[] {
  return [pasteMenuItem(), { label: '新建文件夹', disabled: !!state.value?.busy, run: addFolder }]
}
