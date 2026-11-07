import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  copyFileSync,
  statSync,
} from 'node:fs'
import { join, basename, extname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import sharp from 'sharp'
import {
  actionSchema,
  assetSchema,
  createProject,
  projectSchema,
  validateProject,
  type Project,
  type HostState,
  type Action,
  type Asset,
  type Activity,
  type Proposal,
} from '../shared/model'
import { applyAction } from '../shared/actions'

export class ProjectStore {
  project = createProject()
  activities: Activity[] = []
  proposals: Proposal[] = []
  past: Project[] = []
  future: Project[] = []
  busy = false
  editing = false
  filePath: string | null = null
  dirty = false
  operations = new Map<string, { fingerprint: string; revision: number }>()
  notify: () => void = () => {}
  constructor(
    readonly directory: string,
    readonly runtime: HostState['runtime'],
  ) {
    mkdirSync(join(directory, 'assets'), { recursive: true })
    const recovery = join(directory, 'recovery.json')
    if (existsSync(recovery)) {
      const saved = JSON.parse(readFileSync(recovery, 'utf8'))
      this.project = projectSchema.parse(saved.project)
      validateProject(this.project)
      this.filePath = saved.filePath ?? null
      this.dirty = saved.dirty ?? true
      this.activities = saved.activities ?? []
      this.proposals = saved.proposals ?? []
      this.operations = new Map(saved.operations ?? [])
      for (const record of this.project.generations) {
        if (record.status === 'running') {
          record.status = 'unknown'
          record.message = '上次执行中断，请查询原操作，勿重复生成'
        }
      }
    }
  }
  state(): HostState {
    return {
      project: this.project,
      activities: this.activities,
      proposals: this.proposals,
      busy: this.busy,
      editing: this.editing,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      filePath: this.filePath,
      dirty: this.dirty,
      runtime: this.runtime,
    }
  }
  persist(): void {
    const path = join(this.directory, 'recovery.json')
    const temporary = `${path}.tmp`
    writeFileSync(
      temporary,
      JSON.stringify({
        project: this.project,
        filePath: this.filePath,
        dirty: this.dirty,
        activities: this.activities,
        proposals: this.proposals,
        operations: [...this.operations],
      }),
    )
    if (existsSync(path)) {
      copyFileSync(path, `${path}.bak`)
    }
    renameSync(temporary, path)
    this.notify()
  }
  log(source: string, message: string, status: Activity['status'] = 'done'): Activity {
    const activity: Activity = {
      id: randomUUID(),
      time: new Date().toISOString(),
      source,
      message,
      status,
      revision: this.project.revision,
    }
    this.activities = [...this.activities.slice(-199), activity]
    return activity
  }
  execute(
    input: unknown,
    expectedRevision: number,
    operationId: string,
    source = '手动编辑',
  ): HostState {
    if (this.busy) {
      throw new Error('Agent 正在执行方案，请等待完成')
    }
    const action = actionSchema.parse(input)
    const fingerprint = JSON.stringify(action)
    const previous = this.operations.get(operationId)
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new Error('操作编号已用于不同内容')
      }
      return this.state()
    }
    if (expectedRevision !== this.project.revision) {
      throw new Error('页面已变化，请读取最新页面后重试')
    }
    const before = structuredClone(this.project)
    const prior = {
      past: [...this.past],
      future: [...this.future],
      dirty: this.dirty,
      activities: [...this.activities],
      operations: new Map(this.operations),
    }
    if (action.type === 'history.undo' || action.type === 'history.redo') {
      const undo = action.type === 'history.undo'
      const from = undo ? this.past : this.future
      const to = undo ? this.future : this.past
      const restored = from.pop()
      if (!restored) {
        throw new Error('没有可以恢复的记录')
      }
      to.push(before)
      this.project = {
        ...restored,
        generations: before.generations,
        assets: [
          ...restored.assets,
          ...before.assets.filter(
            (asset) =>
              !restored.assets.some((entry) => entry.id === asset.id) &&
              before.generations.some(
                (record) =>
                  record.resultAssetId === asset.id ||
                  record.input.sourceAssetId === asset.id ||
                  record.input.referenceIds.includes(asset.id),
              ),
          ),
        ],
        revision: before.revision + 1,
        updatedAt: new Date().toISOString(),
      }
    } else {
      this.project = applyAction(before, action)
      if (action.type !== 'selection.set' && action.type !== 'page.select') {
        this.past = [...this.past.slice(-39), before]
        this.future = []
      }
    }
    this.dirty = true
    this.operations.set(operationId, { fingerprint, revision: this.project.revision })
    if (this.operations.size > 512) {
      this.operations.delete(this.operations.keys().next().value!)
    }
    this.log(source, describeAction(action))
    try {
      this.persist()
    } catch (error) {
      this.project = before
      Object.assign(this, prior)
      throw error
    }
    return this.state()
  }
  assetPath(id: string): string {
    if (!this.project.assets.some((asset) => asset.id === id)) {
      throw new Error('素材不存在')
    }
    return join(this.directory, 'assets', `${id}.png`)
  }
  async importImage(
    path: string,
    kind: Asset['kind'],
    options: { name?: string; familyId?: string; provenance?: string } = {},
  ): Promise<Asset> {
    if (statSync(path).size > 30 * 1024 * 1024) {
      throw new Error('单张图片不能超过 30 MB')
    }
    const input = readFileSync(path)
    const metadata = await sharp(input, { limitInputPixels: 80000000 }).metadata()
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) {
      throw new Error('支持 PNG、JPEG 和 WebP 图片')
    }
    const png = metadata.format === 'png' ? input : await sharp(input).rotate().png().toBuffer()
    const info = await sharp(png).metadata()
    const id = randomUUID()
    const family = options.familyId
      ? this.project.assets.find(
          (asset) => asset.id === options.familyId || asset.familyId === options.familyId,
        )
      : undefined
    if (options.familyId && !family) {
      throw new Error('素材系列不存在')
    }
    const siblings = this.project.assets.filter(
      (asset) => family && asset.familyId === family.familyId,
    )
    const asset = assetSchema.parse({
      id,
      name: options.name || basename(path, extname(path)),
      kind,
      familyId: family?.familyId ?? id,
      adopted: false,
      version: Math.max(0, ...siblings.map((entry) => entry.version)) + 1,
      width: info.width,
      height: info.height,
      sha256: createHash('sha256').update(png).digest('hex'),
      sourceName: basename(path),
      createdAt: new Date().toISOString(),
      provenance: options.provenance ?? '本地导入',
    })
    writeFileSync(join(this.directory, 'assets', `${id}.png`), png, { flag: 'wx' })
    const before = structuredClone(this.project)
    this.project = projectSchema.parse({ ...this.project, assets: [...this.project.assets, asset] })
    this.project.revision += 1
    this.past = [...this.past.slice(-39), before]
    this.future = []
    this.dirty = true
    this.log('素材库', `导入 ${asset.name} · v${asset.version}`)
    this.persist()
    return asset
  }
  save(path: string): void {
    const files: Record<string, Uint8Array> = {
      'project.json': strToU8(JSON.stringify(this.project)),
    }
    for (const asset of this.project.assets) {
      files[`assets/${asset.id}.png`] = readFileSync(this.assetPath(asset.id))
    }
    const temporary = `${path}.${randomUUID()}.tmp`
    writeFileSync(temporary, zipSync(files, { level: 0 }))
    renameSync(temporary, path)
    this.filePath = path
    this.dirty = false
    this.log('工程', '工程已保存，包含引用的原始图片')
    this.persist()
  }
  open(path: string): void {
    if (statSync(path).size > 512 * 1024 * 1024) {
      throw new Error('工程文件不能超过 512 MB')
    }
    let expanded = 0
    const files = unzipSync(readFileSync(path), {
      filter(entry) {
        expanded += entry.originalSize
        if (expanded > 1024 * 1024 * 1024) {
          throw new Error('工程解压大小超过 1 GB')
        }
        return entry.name === 'project.json' || /^assets\/[0-9a-f-]{36}\.png$/.test(entry.name)
      },
    })
    if (!files['project.json']) {
      throw new Error('不是有效的 Chiyo 工程')
    }
    const project = projectSchema.parse(JSON.parse(strFromU8(files['project.json'])))
    validateProject(project)
    for (const asset of project.assets) {
      const image = files[`assets/${asset.id}.png`]
      if (!image || createHash('sha256').update(image).digest('hex') !== asset.sha256) {
        throw new Error(`素材损坏或缺失：${asset.name}`)
      }
    }
    for (const asset of project.assets) {
      writeFileSync(
        join(this.directory, 'assets', `${asset.id}.png`),
        files[`assets/${asset.id}.png`],
      )
    }
    this.replace(project)
    this.filePath = path
    this.persist()
  }
  replace(project: Project): void {
    this.project = project
    this.past = []
    this.future = []
    this.proposals = []
    this.operations.clear()
    this.filePath = null
    this.dirty = false
    this.log('工程', `打开 ${project.name}`)
    this.persist()
  }
  propose(title: string, reason: string, actions: Action[], revision: number): Proposal {
    if (this.busy) {
      throw new Error('正在执行，请稍候再提出方案')
    }
    if (revision !== this.project.revision) {
      throw new Error('方案基于旧版本，请重新读取上下文')
    }
    let candidate = this.project
    for (const action of actions) {
      candidate = applyAction(candidate, action)
    }
    const proposal: Proposal = {
      id: randomUUID(),
      title,
      reason,
      actions,
      revision,
      status: 'pending',
    }
    this.proposals = [...this.proposals.slice(-29), proposal]
    this.log('外部 Agent', title, 'proposal')
    this.persist()
    return proposal
  }
  async adopt(id: string, adopt: boolean, delayMs = 600): Promise<HostState> {
    if (this.busy) {
      throw new Error('已有方案正在执行')
    }
    const proposal = this.proposals.find((entry) => entry.id === id)
    if (!proposal || proposal.status !== 'pending') {
      throw new Error('方案已处理或不存在')
    }
    if (!adopt) {
      proposal.status = 'rejected'
      this.persist()
      return this.state()
    }
    if (proposal.revision !== this.project.revision) {
      throw new Error('页面已变化，旧方案不能直接采纳，请重新提出方案')
    }
    const before = structuredClone(this.project)
    let candidate = before
    for (const action of proposal.actions) {
      candidate = applyAction(candidate, action)
    }
    this.busy = true
    const activity = this.log('外部 Agent', `正在执行：${proposal.title}`, 'running')
    this.notify()
    try {
      for (const action of proposal.actions) {
        this.project = applyAction(this.project, action)
        activity.message = describeAction(action)
        this.notify()
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      this.past = [...this.past.slice(-39), before]
      this.future = []
      this.dirty = true
      proposal.status = 'adopted'
      activity.status = 'done'
      activity.message = `已完成：${proposal.title}`
      activity.revision = this.project.revision
      this.persist()
    } catch (error) {
      this.project = before
      activity.status = 'failed'
      throw error
    } finally {
      this.busy = false
      this.notify()
    }
    return this.state()
  }
}

function describeAction(action: Action): string {
  const names: Record<Action['type'], string> = {
    'layer.add': '添加对象',
    'panel.split': '切分漫画格与关联画稿',
    'layer.paste': '粘贴图层及关联内容',
    'layer.update': '修改对象',
    'layer.remove': '删除对象',
    'layer.order': '调整图层顺序',
    'layer.move': '移动图层或文件夹',
    'layer.ungroup': '解除文件夹分组',
    'selection.set': '选择对象',
    'page.add': '添加页面',
    'page.select': '切换页面',
    'page.update': '调整页面',
    'project.rename': '重命名作品',
    'asset.update': '更新素材',
    'history.undo': '撤销',
    'history.redo': '重做',
  }
  if (action.type === 'layer.add') {
    return `添加${action.layer.name}`
  }
  return names[action.type]
}
