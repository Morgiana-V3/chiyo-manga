import { createConnection, type Socket } from 'node:net'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'

interface RpcResult {
  isError?: boolean
  content?: { type: string; text?: string }[]
  structuredContent?: unknown
}
export class NovelPromptClient {
  private socket?: Socket
  private sequence = 0
  private pending = new Map<
    number,
    {
      resolve: (result: RpcResult) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  constructor(
    readonly root: string,
    readonly profile: string,
  ) {}
  async connect(): Promise<void> {
    const key = createHash('sha256')
      .update([resolve(this.root).toLowerCase(), homedir(), resolve(this.profile)].join('|'))
      .digest('hex')
      .slice(0, 24)
    let descriptor: { address: string; token: string }
    try {
      descriptor = JSON.parse(
        readFileSync(join(tmpdir(), `novelprompt-${key}`, 'bridge.json'), 'utf8'),
      )
    } catch {
      throw new Error('未找到 NovelPrompt 开发宿主，请先打开现有开发实例')
    }
    await new Promise<void>((resolveConnection, reject) => {
      const socket = createConnection(descriptor.address)
      this.socket = socket
      const timeout = setTimeout(() => {
        socket.destroy()
        reject(new Error('NovelPrompt 连接超时'))
      }, 5000)
      const lines = createInterface({ input: socket, crlfDelay: Infinity })
      socket.on('connect', () =>
        socket.write(
          `${JSON.stringify({ token: descriptor.token, toolGroups: ['core', 'images'] })}\n`,
        ),
      )
      socket.on('error', () => {
        clearTimeout(timeout)
        reject(new Error('NovelPrompt 当前开发实例未运行或连接已断开'))
      })
      socket.on('close', () => {
        clearTimeout(timeout)
        lines.close()
        for (const entry of this.pending.values()) {
          clearTimeout(entry.timer)
          entry.reject(new Error('宿主断开；操作结果可能未知，请先核对操作记录和余额'))
        }
        this.pending.clear()
      })
      lines.on('line', (line) => {
        try {
          const message = JSON.parse(line)
          if (message.bridgeReady) {
            clearTimeout(timeout)
            resolveConnection()
            return
          }
          const entry = this.pending.get(message.id)
          if (!entry) {
            return
          }
          clearTimeout(entry.timer)
          this.pending.delete(message.id)
          if (message.error) {
            entry.reject(new Error(message.error.message))
          } else {
            entry.resolve(message.result)
          }
        } catch {
          reject(new Error('NovelPrompt 返回无效数据'))
        }
      })
    })
    await this.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'Chiyo Manga', version: '0.2.0' },
    })
    this.socket!.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    )
  }
  request(method: string, params: unknown): Promise<RpcResult> {
    return new Promise((resolveRequest, reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('NovelPrompt 请求超时，结果未知。请查询操作记录，不要重复生图。'))
      }, 240000)
      this.pending.set(id, { resolve: resolveRequest, reject, timer })
      this.socket!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  }
  async call(name: string, args: unknown = {}): Promise<unknown> {
    const result = await this.request('tools/call', { name, arguments: args })
    if (result.isError) {
      throw new Error(
        result.content?.find((entry) => entry.type === 'text')?.text ?? 'NovelPrompt 操作失败',
      )
    }
    if (result.structuredContent) {
      return result.structuredContent
    }
    const text = result.content?.find((entry) => entry.type === 'text')?.text ?? '{}'
    try {
      return JSON.parse(text)
    } catch {
      return { text }
    }
  }
  async verify(): Promise<unknown> {
    const result = await this.call('get_app_state')
    const parsed = z
      .object({
        runtime: z
          .object({ mode: z.string(), appPath: z.string(), dataPath: z.string() })
          .passthrough(),
      })
      .passthrough()
      .parse(result)
    if (
      parsed.runtime.mode !== 'development' ||
      resolve(parsed.runtime.dataPath).toLowerCase() !== resolve(this.profile).toLowerCase() ||
      resolve(parsed.runtime.appPath).toLowerCase() !== resolve(this.root).toLowerCase()
    ) {
      throw new Error('NovelPrompt 运行路径或模式不匹配，已停止连接')
    }
    return result
  }
  close(): void {
    this.socket?.end()
  }
}
