import { z } from 'zod'
import { validPanel } from './panel-geometry'

export const assetKinds = ['character', 'outfit', 'prop', 'scene', 'style', 'artwork'] as const
export const assetLabels: Record<(typeof assetKinds)[number], string> = {
  character: '人物',
  outfit: '服装',
  prop: '道具',
  scene: '场景',
  style: '画风',
  artwork: '画稿',
}
const identifier = z.string().uuid()
const color = z.string().regex(/^(#[0-9a-fA-F]{6}|none)$/)
const boundedText = z.string().max(10000)
const point = z.tuple([z.number().min(-4).max(5), z.number().min(-4).max(5)])
export const layerSchema = z.object({
  id: identifier,
  kind: z.enum(['panel', 'image', 'text', 'balloon', 'stroke', 'effect', 'group']),
  name: z.string().min(1).max(200),
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  width: z.number().min(8).max(10000),
  height: z.number().min(8).max(10000),
  rotation: z.number().min(-360).max(360).default(0),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  fill: color.default('#ffffff'),
  stroke: color.default('#171717'),
  strokeWidth: z.number().min(0).max(40).default(3),
  text: boundedText.default(''),
  fontSize: z.number().min(8).max(300).default(28),
  vertical: z.boolean().default(false),
  tail: z.number().min(-200).max(200).default(35),
  shape: z.enum(['rectangle', 'ellipse', 'slant', 'polygon']).default('rectangle'),
  vertices: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(3)
    .max(32)
    .optional(),
  balloonStyle: z.enum(['oval', 'organic', 'thought', 'shout', 'whisper', 'caption']).optional(),
  outline: z.array(point).length(8).optional(),
  tails: z
    .array(z.object({ tip: point, bend: point, width: z.number().min(0.02).max(0.6) }))
    .max(4)
    .optional(),
  lobes: z
    .array(
      z.object({
        x: z.number().min(-2).max(2),
        y: z.number().min(-2).max(2),
        width: z.number().min(0.2).max(2),
        height: z.number().min(0.2).max(2),
        text: boundedText,
      }),
    )
    .max(3)
    .optional(),
  textPadding: z.number().min(0).max(100).optional(),
  autoFit: z.boolean().optional(),
  effect: z.enum(['tone', 'speed', 'focus']).default('tone'),
  assetId: identifier.optional(),
  referenceIds: z.array(identifier).max(30).default([]),
  parentId: identifier.nullable().optional(),
  folderId: identifier.nullable().optional(),
  points: z
    .array(z.tuple([z.number(), z.number()]))
    .max(5000)
    .default([]),
  prompt: boundedText.default(''),
  notes: boundedText.default(''),
})
export type Layer = z.infer<typeof layerSchema>
export const assetSchema = z.object({
  id: identifier,
  name: z.string().min(1).max(200),
  kind: z.enum(assetKinds),
  notes: boundedText.default(''),
  version: z.number().int().positive().default(1),
  familyId: identifier,
  adopted: z.boolean().default(false),
  width: z.number().positive(),
  height: z.number().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceName: z.string().max(500),
  createdAt: z.string(),
  provenance: boundedText.default(''),
})
export type Asset = z.infer<typeof assetSchema>
export const pageSchema = z.object({
  id: identifier,
  name: z.string().min(1).max(200),
  width: z.number().int().min(256).max(6000),
  height: z.number().int().min(256).max(6000),
  dpi: z.number().int().min(72).max(1200),
  margin: z.number().min(0).max(300),
  layers: z.array(layerSchema).max(500),
})
export type Page = z.infer<typeof pageSchema>
export const generationInputSchema = z.object({
  prompt: z.string().min(1).max(10000),
  negative: z.string().max(10000).default(''),
  width: z.number().int().min(64).max(2048).multipleOf(64).default(832),
  height: z.number().int().min(64).max(2048).multipleOf(64).default(1216),
  version: z.enum(['v5', 'v4.5']).default('v5'),
  steps: z.number().int().min(1).max(28).default(23),
  scale: z.number().min(0).max(10).default(5),
  seed: z.number().int().min(0).max(4294967295).optional(),
  referenceIds: z.array(identifier).max(30).default([]),
  acknowledgeTextOnly: z.boolean().default(false),
  targetLayerId: identifier.optional(),
  sourceAssetId: identifier.optional(),
  rectangles: z
    .array(
      z.object({
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .max(20)
    .default([]),
  strength: z.number().min(0.01).max(1).default(0.6),
})
export type GenerationInput = z.infer<typeof generationInputSchema>
export const generationSchema = z.object({
  id: identifier,
  input: generationInputSchema,
  status: z.enum(['running', 'succeeded', 'unknown', 'failed']),
  createdAt: z.string(),
  sourceRevision: z.number().int(),
  resultAssetId: identifier.optional(),
  providerImageName: z.string().optional(),
  resultPath: z.string().optional(),
  message: z.string(),
  receipt: z.string(),
})
export type Generation = z.infer<typeof generationSchema>
export const projectSchema = z.object({
  schema: z.literal(1),
  id: identifier,
  name: z.string().min(1).max(200),
  revision: z.number().int().nonnegative(),
  activePageId: identifier,
  selectedId: identifier.nullable(),
  pages: z.array(pageSchema).min(1).max(100),
  assets: z.array(assetSchema).max(1000),
  generations: z.array(generationSchema).max(500).default([]),
  updatedAt: z.string(),
})
export type Project = z.infer<typeof projectSchema>
// Creation defaults must never become writes in a partial update.
function patchObject<T extends z.ZodRawShape>(shape: T) {
  type OptionalShape = {
    [K in keyof T]: z.ZodOptional<T[K] extends z.ZodDefault<infer Inner> ? Inner : T[K]>
  }
  return z.object(
    Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [
        key,
        z.optional(value instanceof z.ZodDefault ? value.removeDefault() : value),
      ]),
    ) as OptionalShape,
  )
}
export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('panel.split'),
    id: identifier,
    newPanelId: identifier,
    from: z.tuple([z.number().min(-20000).max(20000), z.number().min(-20000).max(20000)]),
    to: z.tuple([z.number().min(-20000).max(20000), z.number().min(-20000).max(20000)]),
    gap: z.number().min(0).max(100),
    childIds: z.record(identifier, identifier),
  }),
  z.object({ type: z.literal('layer.add'), layer: layerSchema }),
  z.object({
    type: z.literal('layer.paste'),
    sourceProjectId: identifier,
    layers: z.array(layerSchema).min(1).max(500),
    selectedId: identifier,
  }),
  z.object({
    type: z.literal('layer.update'),
    id: identifier,
    patch: patchObject(layerSchema.omit({ id: true, kind: true, folderId: true }).shape),
  }),
  z.object({ type: z.literal('layer.remove'), id: identifier }),
  z.object({ type: z.literal('layer.order'), id: identifier, direction: z.enum(['up', 'down']) }),
  z.object({
    type: z.literal('layer.move'),
    id: identifier,
    targetId: identifier.nullable(),
    placement: z.enum(['above', 'below', 'inside']),
  }),
  z.object({ type: z.literal('layer.ungroup'), id: identifier }),
  z.object({ type: z.literal('selection.set'), id: identifier.nullable() }),
  z.object({ type: z.literal('page.add'), page: pageSchema }),
  z.object({ type: z.literal('page.select'), id: identifier }),
  z.object({
    type: z.literal('page.update'),
    patch: pageSchema.omit({ id: true, layers: true }).partial(),
  }),
  z.object({ type: z.literal('project.rename'), name: z.string().min(1).max(200) }),
  z.object({
    type: z.literal('asset.update'),
    id: identifier,
    patch: patchObject(
      assetSchema.pick({ name: true, kind: true, notes: true, adopted: true }).shape,
    ),
  }),
  z.object({ type: z.literal('history.undo') }),
  z.object({ type: z.literal('history.redo') }),
])
export type Action = z.infer<typeof actionSchema>
export interface Activity {
  id: string
  time: string
  source: string
  message: string
  status: 'running' | 'done' | 'failed' | 'proposal'
  revision: number
}
export interface Proposal {
  id: string
  title: string
  reason: string
  revision: number
  actions: Action[]
  status: 'pending' | 'adopted' | 'rejected'
}
export interface HostState {
  project: Project
  activities: Activity[]
  proposals: Proposal[]
  busy: boolean
  editing: boolean
  canUndo: boolean
  canRedo: boolean
  filePath: string | null
  dirty: boolean
  runtime: { root: string; dataDirectory: string; mode: string; mcpConfig: string }
}
export interface CommandRequest {
  action: Action
  expectedRevision: number
  operationId: string
}
export interface ChiyoApi {
  setEditing(editing: boolean): void
  state(): Promise<HostState>
  execute(request: CommandRequest): Promise<HostState>
  file(command: 'new' | 'open' | 'save' | 'saveAs'): Promise<HostState>
  importAssets(kind: Asset['kind'], familyId?: string): Promise<HostState>
  exportPng(dataUrl: string): Promise<string | null>
  proposal(id: string, adopt: boolean): Promise<HostState>
  providerStatus(): Promise<unknown>
  generate(
    input: GenerationInput,
    expectedRevision: number,
    operationId: string,
  ): Promise<HostState>
  recoverGeneration(id: string): Promise<HostState>
  onState(listener: (state: HostState) => void): () => void
}

export function makeLayer(kind: Layer['kind'], patch: Partial<Layer> = {}): Layer {
  const names = {
    panel: '漫画格',
    image: '画稿',
    text: '文字',
    balloon: '对白',
    stroke: '笔画',
    effect: '网点',
    group: '文件夹',
  }
  return layerSchema.parse({
    id: crypto.randomUUID(),
    kind,
    name: names[kind],
    x: 80,
    y: 80,
    width: 360,
    height: 260,
    ...patch,
  })
}

export function createProject(name = '未命名作品'): Project {
  const page: Page = {
    id: crypto.randomUUID(),
    name: '第 1 页',
    width: 1200,
    height: 1800,
    dpi: 300,
    margin: 60,
    layers: [],
  }
  return {
    schema: 1,
    id: crypto.randomUUID(),
    name,
    revision: 0,
    activePageId: page.id,
    selectedId: null,
    pages: [page],
    assets: [],
    generations: [],
    updatedAt: new Date().toISOString(),
  }
}

export function activePage(project: Project): Page {
  const page = project.pages.find((entry) => entry.id === project.activePageId)
  if (!page) {
    throw new Error('当前页面不存在')
  }
  return page
}

export function validateProject(project: Project): void {
  projectSchema.parse(project)
  activePage(project)
  const ids = [
    ...project.pages,
    ...project.assets,
    ...project.pages.flatMap((page) => page.layers),
  ].map((entry) => entry.id)
  if (new Set(ids).size !== ids.length) {
    throw new Error('工程中存在重复编号')
  }
  for (const page of project.pages) {
    if (page.margin * 2 >= Math.min(page.width, page.height)) {
      throw new Error('安全边距必须小于页面短边的一半')
    }
    for (const layer of page.layers) {
      if (
        layer.kind === 'panel' &&
        layer.shape === 'polygon' &&
        (!layer.vertices || !validPanel(layer.vertices))
      )
        throw new Error('格框顶点必须形成不交叉的凸多边形')
      const visited = new Set([layer.id])
      let folderId = layer.folderId
      while (folderId) {
        if (visited.has(folderId)) {
          throw new Error('文件夹不能包含自身或形成循环')
        }
        visited.add(folderId)
        if (visited.size > 9) {
          throw new Error('文件夹最多嵌套 8 层')
        }
        const folder = page.layers.find((entry) => entry.id === folderId && entry.kind === 'group')
        if (!folder) {
          throw new Error('所属文件夹必须存在于同一页面')
        }
        folderId = folder.folderId
      }
      for (const id of [...layer.referenceIds, ...(layer.assetId ? [layer.assetId] : [])]) {
        if (!project.assets.some((asset) => asset.id === id)) {
          throw new Error('图层引用的素材不存在')
        }
      }
      if (
        layer.parentId &&
        !page.layers.some((parent) => parent.id === layer.parentId && parent.kind === 'panel')
      ) {
        throw new Error('裁切目标必须是同页漫画格')
      }
    }
  }
  if (
    project.selectedId &&
    !activePage(project).layers.some((layer) => layer.id === project.selectedId)
  ) {
    throw new Error('选中对象不存在')
  }
}
