import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const descriptorPath = process.argv[2]
if (!descriptorPath) {
  process.stderr.write('用法：node mcp-bridge.mjs <Chiyo 数据目录/bridge.json>\n')
  process.exit(1)
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
let initialized = false
for await (const line of lines) {
  let request
  try {
    request = JSON.parse(line)
    if (!initialized && request.method !== 'initialize') {
      throw new Error('请先 initialize')
    }
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'))
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/rpc`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${descriptor.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(120000),
    })
    if (!response.ok) {
      throw new Error(`连接失败：${response.status}`)
    }
    if (request.method === 'initialize') {
      initialized = true
    }
    if (response.status !== 204) {
      process.stdout.write(`${await response.text()}\n`)
    }
  } catch (error) {
    if (request?.id !== undefined) {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: `Chiyo 桌面连接失败。请确认软件已打开；未知写入请先查询记录，不要重试。${error.message}` } })}\n`,
      )
    } else {
      process.stderr.write(`${error.message}\n`)
    }
  }
}
