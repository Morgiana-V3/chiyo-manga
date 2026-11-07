import { join, resolve } from 'node:path'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import { generationInputSchema, type Generation, type GenerationInput } from '../shared/model'
import { NovelPromptClient } from './novel-prompt'
import type { ProjectStore } from './project-store'

export class GenerationService {
  constructor(
    private store: ProjectStore,
    private appData: string,
    private novelPromptRoot: string,
  ) {}
  client(): NovelPromptClient {
    return new NovelPromptClient(
      resolve(process.env.CHIYO_NOVELPROMPT_ROOT || this.novelPromptRoot),
      join(this.appData, 'novel-prompt-dev'),
    )
  }
  async status(): Promise<unknown> {
    const client = this.client()
    try {
      await client.connect()
      const host = await client.verify()
      const subscription = await client.call('nai_subscription')
      return {
        host: z.object({ runtime: z.unknown(), capabilities: z.unknown() }).parse(host),
        subscription,
      }
    } finally {
      client.close()
    }
  }
  async generate(raw: GenerationInput, revision: number, operationId: string): Promise<void> {
    const input = generationInputSchema.parse(raw)
    const store = this.store
    if (store.busy) {
      throw new Error('已有任务正在执行')
    }
    if (store.project.generations.some((entry) => entry.id === operationId)) {
      throw new Error('操作编号已存在，请查看原记录，不要重复生成')
    }
    if (revision !== store.project.revision) {
      throw new Error('页面已变化，请重新确认生成内容')
    }
    if (store.project.generations.length >= 500) throw new Error('本工程生成记录已满，请新建工程')
    if (
      input.targetLayerId &&
      !store.project.pages
        .flatMap((page) => page.layers)
        .some((layer) => layer.id === input.targetLayerId)
    ) {
      throw new Error('目标对象不存在')
    }
    if (input.referenceIds.some((id) => !store.project.assets.some((asset) => asset.id === id))) {
      throw new Error('参考素材不存在')
    }
    if (input.referenceIds.length && !input.acknowledgeTextOnly) {
      throw new Error(
        '当前 NovelPrompt 生图接口不接收参考图片。请由 Agent 看图编写提示后，明确选择仅传提示词；素材绑定不等于图像参考控制。',
      )
    }
    const source = input.sourceAssetId
      ? store.project.generations.find(
          (entry) => entry.resultAssetId === input.sourceAssetId && entry.providerImageName,
        )
      : undefined
    if (input.sourceAssetId && !source) {
      throw new Error('局部重绘需要选择本项目通过 NovelPrompt 生成的原图')
    }
    if (source && !input.rectangles.length) {
      throw new Error('请填写至少一个原图像素重绘选区')
    }
    if (source) {
      const asset = store.project.assets.find((entry) => entry.id === input.sourceAssetId)!
      if (
        input.rectangles.some(
          (rect) => rect.x + rect.width > asset.width || rect.y + rect.height > asset.height,
        )
      ) {
        throw new Error('重绘选区超出原图边界')
      }
    }
    const record: Generation = {
      id: operationId,
      input,
      status: 'running',
      createdAt: new Date().toISOString(),
      sourceRevision: revision,
      message: '正在连接 NovelPrompt…',
      receipt: '',
    }
    store.project.generations.push(record)
    store.project.revision += 1
    store.dirty = true
    store.busy = true
    store.log('NovelAI', `提交生成 · ${operationId}`, 'running')
    store.persist()
    const client = this.client()
    let sent = false
    try {
      await client.connect()
      const environment = await client.verify()
      const before = await client.call('nai_subscription')
      record.message = source ? '正在局部重绘…' : '正在生成画稿…'
      store.notify()
      const parameters: Record<string, unknown> = {
        operation_id: operationId,
        confirm: true,
        base: input.prompt,
        negative: input.negative,
        version: input.version,
        steps: input.steps,
        scale: input.scale,
        seed: input.seed,
        quality_tags: false,
        uc_preset: 'none',
        count: 1,
      }
      if (source) {
        parameters.image_name = source.providerImageName
        parameters.rectangles = input.rectangles
        parameters.strength = input.strength
      } else {
        parameters.width = input.width
        parameters.height = input.height
      }
      const artifacts = join(store.directory, 'executions', operationId)
      mkdirSync(artifacts, { recursive: true })
      writeFileSync(
        join(artifacts, 'request.json'),
        JSON.stringify(
          {
            input,
            parameters,
            environment: z.object({ runtime: z.unknown() }).parse(environment),
            before,
            referenceMode: 'agent-context-only; no reference image transmitted',
          },
          null,
          2,
        ),
      )
      sent = true
      const result = await client.call(source ? 'inpaint_image' : 'generate_image', parameters)
      writeFileSync(join(artifacts, 'result.json'), JSON.stringify(result, null, 2))
      await this.importResult(record.id, result)
    } catch (error) {
      const current = store.project.generations.find((entry) => entry.id === record.id)!
      current.status = sent ? 'unknown' : 'failed'
      current.message = error instanceof Error ? error.message : String(error)
      store.log('NovelAI', `${current.message} · 操作 ${record.id}`, 'failed')
      store.persist()
      throw error
    } finally {
      client.close()
      store.busy = false
      store.notify()
    }
  }
  private async importResult(id: string, result: unknown): Promise<void> {
    const parsed = z
      .object({
        images: z.array(z.object({ path: z.string(), name: z.string() })),
        anlasChange: z.unknown().optional(),
        stopped: z.string().nullable().optional(),
      })
      .passthrough()
      .parse(result)
    const record = this.store.project.generations.find((entry) => entry.id === id)!
    record.receipt = JSON.stringify(result)
    if (!parsed.images.length) {
      throw new Error(parsed.stopped || '宿主未返回图片，请核对记录和余额')
    }
    record.providerImageName = parsed.images[0].name
    record.resultPath = parsed.images[0].path
    const asset = await this.store.importImage(parsed.images[0].path, 'artwork', {
      name: `画稿 ${this.store.project.generations.length}`,
      familyId: record.input.sourceAssetId,
      provenance: JSON.stringify(
        {
          provider: 'NovelPrompt / NovelAI',
          operationId: id,
          referenceIds: record.input.referenceIds,
          referenceImagesTransmitted: false,
          input: record.input,
          receipt: result,
        },
        null,
        2,
      ),
    })
    const current = this.store.project.generations.find((entry) => entry.id === id)!
    current.resultAssetId = asset.id
    current.status = 'succeeded'
    current.message = `已生成 · Anlas 变化：${JSON.stringify(parsed.anlasChange ?? '未知')}`
    this.store.log('NovelAI', `${current.message} · 操作 ${id}`)
    this.store.persist()
  }
  async recover(id: string): Promise<void> {
    const record = this.store.project.generations.find((entry) => entry.id === id)
    if (!record || record.status === 'succeeded') {
      return
    }
    if (this.store.busy) {
      throw new Error('已有任务正在执行')
    }
    const client = this.client()
    this.store.busy = true
    this.store.notify()
    try {
      const receiptPath = join(this.store.directory, 'executions', id, 'result.json')
      if (existsSync(receiptPath)) {
        await this.importResult(id, JSON.parse(readFileSync(receiptPath, 'utf8')))
        return
      }
      await client.connect()
      await client.verify()
      const result = await client.call('get_operation', { operation_id: id })
      const queried = z
        .object({
          result: z
            .object({
              structuredContent: z.unknown().optional(),
              content: z
                .array(z.object({ type: z.string(), text: z.string().optional() }))
                .optional(),
              isError: z.boolean().optional(),
            })
            .optional(),
        })
        .parse(result)
      if (queried.result && !queried.result.isError) {
        const recovered =
          queried.result.structuredContent ??
          JSON.parse(queried.result.content?.find((entry) => entry.type === 'text')?.text ?? '{}')
        if (z.object({ images: z.array(z.unknown()).min(1) }).safeParse(recovered).success) {
          await this.importResult(id, recovered)
          return
        }
      }
      record.message = `操作查询：${JSON.stringify(result)}`
      this.store.log('NovelAI', `已查询操作 ${id}；未重试生成`)
      this.store.persist()
    } finally {
      client.close()
      this.store.busy = false
      this.store.notify()
    }
  }
}
