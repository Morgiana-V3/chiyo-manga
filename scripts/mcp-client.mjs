import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

// Diagnostic client for the current desktop host. It never starts another host.
const request = JSON.parse(process.argv[2])
const reportDirectory = process.env.CHIYO_REPORT_DIR || join(tmpdir(), 'chiyo-v01-acceptance')
mkdirSync(reportDirectory, { recursive: true })
const child = spawn(
  process.execPath,
  ['scripts/mcp-bridge.mjs', join(process.env.APPDATA, 'chiyo-manga-dev', 'bridge.json')],
  { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true },
)
const pending = new Map()
const lines = createInterface({ input: child.stdout })
let sequence = 0
lines.on('line', (line) => {
  const message = JSON.parse(line)
  const callback = pending.get(message.id)
  if (callback) {
    pending.delete(message.id)
    callback(message)
  }
})
function rpc(method, params) {
  return new Promise((resolve) => {
    const id = ++sequence
    pending.set(id, resolve)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}
try {
  const initialized = await rpc('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'Codex live acceptance', version: '1' },
  })
  if (initialized.error) throw new Error(`MCP 初始化失败：${initialized.error.message}`)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  const response = await rpc(
    request.method || 'tools/call',
    request.params || { name: request.name, arguments: request.arguments || {} },
  )
  const stamp = `${Date.now()}-${request.name || 'protocol'}`
  for (const [index, content] of (response.result?.content || []).entries()) {
    if (content.type === 'image') {
      const path = join(reportDirectory, `${stamp}-${index}.png`)
      writeFileSync(path, Buffer.from(content.data, 'base64'))
      content.data = `[saved image: ${path}]`
    }
  }
  writeFileSync(
    join(reportDirectory, `${stamp}.json`),
    JSON.stringify({ request, response }, null, 2),
  )
  process.stdout.write(`${JSON.stringify(response)}\n`)
} finally {
  child.stdin.end()
  lines.close()
}
