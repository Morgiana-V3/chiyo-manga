import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { isAbsolute, extname, resolve } from 'node:path'
import { z } from 'zod'
import sharp from 'sharp'
import { actionSchema, assetKinds, generationInputSchema } from '../shared/model'
import type { ProjectStore } from './project-store'
import type { GenerationService } from './generation'

import { viewSchema, canvasDragSchema, type CanvasDrag, type ViewOptions } from '../shared/view'

const schemas = {
  chiyo_canvas_drag: canvasDragSchema,
  chiyo_set_view: viewSchema,
  chiyo_save_project: z.object({
    path: z.string().optional(),
    expected_revision: z.number().int(),
  }),
  chiyo_close_window: z.object({ expected_revision: z.number().int() }),
  chiyo_provider_status: z.object({}),
  chiyo_generate: z.object({
    input: generationInputSchema,
    expected_revision: z.number().int(),
    operation_id: z.string().uuid(),
  }),
  chiyo_recover_generation: z.object({ operation_id: z.string().uuid() }),
  chiyo_get_context: z.object({}),
  chiyo_get_operation: z.object({ operation_id: z.string().uuid() }),
  chiyo_export_page: z.object({ path: z.string().min(1), expected_revision: z.number().int() }),
  chiyo_view_image: z.object({ asset_id: z.string().uuid() }),
  chiyo_view_workspace: z.object({}),
  chiyo_import_image: z.object({
    path: z.string().min(1),
    kind: z.enum(assetKinds),
    name: z.string().max(200).optional(),
    family_id: z.string().uuid().optional(),
    provenance: z.string().max(10000).optional(),
    expected_revision: z.number().int(),
  }),
  chiyo_propose: z.object({
    title: z.string().min(1).max(200),
    reason: z.string().min(1).max(10000),
    expected_revision: z.number().int(),
    actions: z.array(actionSchema).min(1).max(30),
  }),
  chiyo_adopt_proposal: z.object({
    proposal_id: z.string().uuid(),
    step_delay_ms: z.number().int().min(100).max(2000).default(600),
  }),
  chiyo_frontend_action: z.object({
    action: actionSchema,
    expected_revision: z.number().int(),
    operation_id: z.string().uuid(),
    step_delay_ms: z.number().int().min(100).max(2000).default(600),
  }),
}
const descriptions: Record<keyof typeof schemas, string> = {
  chiyo_canvas_drag:
    '在当前真实画布执行可见鼠标拖动。from/to 是页面像素坐标，必须位于可见工作区；先选择工具和对象。走人工指针处理器，operation_id 去重。不接受屏幕外坐标。',
  chiyo_set_view: '切换当前前台工具、侧栏、缩放和辅助线，与人工共享视图，不改变工程。',
  chiyo_save_project:
    '保存当前工程。无 path 时保存原文件；新路径须为绝对 .chiyo，拒绝覆盖其他文件。',
  chiyo_close_window: '仅当工程已保存、无输入或任务时正常关闭当前窗口。',
  chiyo_export_page:
    '将当前页面按实际像素尺寸和 DPI 导出 PNG，与人工导出共用渲染。提供绝对 .png 路径；不覆盖已有文件。',
  chiyo_get_operation: '按操作编号读取编辑回执或生成记录。未知结果先查询，禁止盲目重试。',
  chiyo_provider_status:
    '核实当前 NovelPrompt 开发宿主路径、模式和数据目录，查询真实 NovelAI 余额。只读。',
  chiyo_generate:
    '使用现有 NovelPrompt 配置真实生成或局部重绘一张，结果进入素材库等待采用。需已有用户生成授权。先看图、展示方案并采纳；referenceIds 为 Agent 上下文引用，当前宿主接口不传参考图片，需 acknowledgeTextOnly 明确同意。未知结果先查询，禁止重试。',
  chiyo_recover_generation: '查询未知操作在 NovelPrompt 的记录，不重试生成。',
  chiyo_get_context:
    '读取当前真实宿主、页面、图层、素材版本、方案和操作记录。开始前核实项目路径、运行模式和数据目录。',
  chiyo_view_image:
    '查看实际素材图片（最长边 1600px），包含素材身份和版本。生成参考以实际图片为准。',
  chiyo_view_workspace: '截图当前可见的 Electron 漫画工作区，检查真实布局和执行结果。',
  chiyo_import_image:
    '将本地真实 PNG/JPEG/WebP 导入当前项目素材库。family_id 可为同系列任一素材编号，新图作为候选版本，不自动替换采用稿。外部生成请记录 provenance，包括供应商、操作编号、参考与费用。',
  chiyo_propose:
    '把编辑方案展示到前台协作面板。先实际看图，再提出具体方案。动作必须基于当前 revision；不能改变蓝本或假称生成。',
  chiyo_adopt_proposal:
    '在已有用户任务授权下采纳待执行方案，前台逐步可见。执行期间锁定人工写入；完成后可整组撤销。',
  chiyo_frontend_action:
    '执行一个前台可见编辑动作，与人工共用业务动作和撤销。使用唯一 operation_id 防止重复写入；未知结果先查上下文。',
}
type Rpc = {
  id?: string | number
  method: string
  params?: { name?: string; arguments?: unknown; protocolVersion?: string }
}

export async function startMcp(
  store: ProjectStore,
  screenshot: () => Promise<Buffer>,
  show: () => void,
  generation: GenerationService,
  renderPage: () => Promise<string>,
  setView: (options: ViewOptions) => Promise<unknown>,
  closeWindow: () => void,
  dragCanvas: (request: CanvasDrag) => Promise<unknown>,
): Promise<() => void> {
  const token = randomBytes(32).toString('hex')
  const server = createServer(async (request, response) => {
    if (
      request.method !== 'POST' ||
      request.url !== '/rpc' ||
      request.headers.authorization !== `Bearer ${token}` ||
      request.headers.origin
    ) {
      response.writeHead(403).end('Forbidden')
      return
    }
    let rpc: Rpc | undefined
    try {
      let body = ''
      for await (const chunk of request) {
        body += chunk.toString()
        if (body.length > 2 * 1024 * 1024) {
          throw new Error('请求过大')
        }
      }
      rpc = JSON.parse(body) as Rpc
      let result: unknown
      if (rpc.method === 'initialize') {
        const supported = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
        const requested = rpc.params?.protocolVersion ?? ''
        result = {
          protocolVersion: supported.includes(requested) ? requested : supported[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'chiyo-manga', version: '0.4.0' },
          instructions:
            '所有工具连接当前桌面实例。先 chiyo_get_context 核实环境，再 view_image/view_workspace 亲自看图。编辑方案须前台可见。素材引用不等于已传给生图服务；外部生成必须如实记录输入参考与来源。未知写入不重试，先查询操作记录。',
        }
      } else if (rpc.method.startsWith('notifications/')) {
        response.writeHead(204).end()
        return
      } else if (rpc.method === 'ping') {
        result = {}
      } else if (rpc.method === 'tools/list') {
        result = {
          tools: Object.entries(schemas).map(([name, schema]) => ({
            name,
            description: descriptions[name as keyof typeof schemas],
            inputSchema: z.toJSONSchema(schema),
            annotations: {
              readOnlyHint: [
                'chiyo_get_context',
                'chiyo_view_image',
                'chiyo_view_workspace',
              ].includes(name),
              openWorldHint: false,
            },
          })),
        }
      } else if (rpc.method === 'tools/call') {
        try {
          const name = rpc.params?.name as keyof typeof schemas
          const schema = schemas[name]
          if (!schema) {
            throw new Error('未知工具')
          }
          schema.parse(rpc.params?.arguments ?? {})
          const args = rpc.params?.arguments ?? {}
          if (
            store.editing &&
            [
              'chiyo_set_view',
              'chiyo_save_project',
              'chiyo_close_window',
              'chiyo_export_page',
              'chiyo_generate',
              'chiyo_import_image',
              'chiyo_propose',
              'chiyo_adopt_proposal',
              'chiyo_frontend_action',
              'chiyo_recover_generation',
            ].includes(name)
          ) {
            throw new Error('用户正在输入或拖动画布，请等待编辑结束后读取新上下文')
          }
          let output: unknown
          if (name === 'chiyo_canvas_drag') {
            output = await dragCanvas(canvasDragSchema.parse(args))
          } else if (name === 'chiyo_set_view') {
            if (store.busy) throw new Error('正在执行，请稍后切换视图')
            show()
            output = await setView(schemas.chiyo_set_view.parse(args))
          } else if (name === 'chiyo_save_project') {
            const parsed = schemas.chiyo_save_project.parse(args)
            if (store.busy || parsed.expected_revision !== store.project.revision)
              throw new Error('工程已变化或正在执行')
            const path = parsed.path ?? store.filePath
            if (!path || !isAbsolute(path) || extname(path).toLowerCase() !== '.chiyo')
              throw new Error('需要绝对 .chiyo 路径')
            if (
              existsSync(path) &&
              resolve(path).toLowerCase() !== resolve(store.filePath ?? '').toLowerCase()
            )
              throw new Error('不覆盖其他已有工程')
            await store.save(path)
            store.notify()
            output = { path, revision: store.project.revision, dirty: store.dirty }
          } else if (name === 'chiyo_close_window') {
            const parsed = schemas.chiyo_close_window.parse(args)
            if (store.busy || store.dirty || parsed.expected_revision !== store.project.revision)
              throw new Error('请先保存工程并等待任务结束')
            output = { closing: true }
            setTimeout(closeWindow, 100)
          } else if (name === 'chiyo_export_page') {
            const parsed = schemas.chiyo_export_page.parse(args)
            if (!isAbsolute(parsed.path) || extname(parsed.path).toLowerCase() !== '.png')
              throw new Error('需要绝对 PNG 路径')
            if (store.busy || parsed.expected_revision !== store.project.revision)
              throw new Error('页面已变化或正在执行')
            store.busy = true
            store.notify()
            try {
              show()
              const page = store.project.pages.find(
                (entry) => entry.id === store.project.activePageId,
              )!
              const data = await renderPage()
              writeFileSync(
                parsed.path,
                await sharp(Buffer.from(data.split(',')[1], 'base64'))
                  .withMetadata({ density: page.dpi })
                  .png()
                  .toBuffer(),
                { flag: 'wx' },
              )
              store.log('外部 Agent', `导出 PNG：${parsed.path}`)
              store.persist()
              output = {
                path: parsed.path,
                revision: store.project.revision,
                width: page.width,
                height: page.height,
                dpi: page.dpi,
              }
            } finally {
              store.busy = false
              store.notify()
            }
          } else if (name === 'chiyo_get_operation') {
            const id = schemas.chiyo_get_operation.parse(args).operation_id
            output = store.operations.get(id) ??
              store.project.generations.find((entry) => entry.id === id) ?? { status: 'not_found' }
          } else if (name === 'chiyo_provider_status') {
            output = await generation.status()
          } else if (name === 'chiyo_generate') {
            const parsed = schemas.chiyo_generate.parse(args)
            show()
            await generation.generate(parsed.input, parsed.expected_revision, parsed.operation_id)
            output = store.state()
          } else if (name === 'chiyo_recover_generation') {
            const parsed = schemas.chiyo_recover_generation.parse(args)
            await generation.recover(parsed.operation_id)
            output = store.state()
          } else if (name === 'chiyo_get_context') {
            output = store.state()
          } else if (name === 'chiyo_view_image') {
            const parsed = schemas.chiyo_view_image.parse(args)
            const data = await sharp(store.assetPath(parsed.asset_id))
              .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
              .png()
              .toBuffer()
            result = {
              content: [
                { type: 'image', mimeType: 'image/png', data: data.toString('base64') },
                {
                  type: 'text',
                  text: JSON.stringify(
                    store.project.assets.find((asset) => asset.id === parsed.asset_id),
                  ),
                },
              ],
            }
          } else if (name === 'chiyo_view_workspace') {
            show()
            result = {
              content: [
                {
                  type: 'image',
                  mimeType: 'image/png',
                  data: (await screenshot()).toString('base64'),
                },
              ],
            }
          } else if (name === 'chiyo_import_image') {
            const parsed = schemas.chiyo_import_image.parse(args)
            if (store.busy || parsed.expected_revision !== store.project.revision) {
              throw new Error('页面已变化或正在执行，请重新读取上下文')
            }
            store.busy = true
            store.notify()
            try {
              output = await store.importImage(parsed.path, parsed.kind, {
                name: parsed.name,
                familyId: parsed.family_id,
                provenance: parsed.provenance,
              })
            } finally {
              store.busy = false
              store.notify()
            }
            show()
          } else if (name === 'chiyo_propose') {
            const parsed = schemas.chiyo_propose.parse(args)
            output = store.propose(
              parsed.title,
              parsed.reason,
              parsed.actions,
              parsed.expected_revision,
            )
            show()
          } else if (name === 'chiyo_adopt_proposal') {
            const parsed = schemas.chiyo_adopt_proposal.parse(args)
            show()
            output = await store.adopt(parsed.proposal_id, true, parsed.step_delay_ms)
          } else if (name === 'chiyo_frontend_action') {
            const parsed = schemas.chiyo_frontend_action.parse(args)
            show()
            output = store.execute(
              parsed.action,
              parsed.expected_revision,
              parsed.operation_id,
              '外部 Agent',
            )
            await new Promise((resolve) => setTimeout(resolve, parsed.step_delay_ms))
          }
          if (!result) {
            result = { content: [{ type: 'text', text: JSON.stringify(output) }] }
          }
        } catch (error) {
          result = {
            isError: true,
            content: [
              { type: 'text', text: error instanceof Error ? error.message : String(error) },
            ],
          }
        }
      } else {
        response.setHeader('Content-Type', 'application/json')
        response.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: rpc.id ?? null,
            error: { code: -32601, message: 'Method not found' },
          }),
        )
        return
      }
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id ?? null, result }))
    } catch (error) {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: rpc?.id ?? null,
          error: { code: -32603, message: error instanceof Error ? error.message : '请求失败' },
        }),
      )
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('MCP 桥接启动失败')
  }
  writeFileSync(
    join(store.directory, 'bridge.json'),
    JSON.stringify({ port: address.port, token, pid: process.pid, root: store.runtime.root }),
  )
  return () => server.close()
}
