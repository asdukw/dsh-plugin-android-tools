// Minimal bridge host mock: speaks the documented contract so you can try
// dsh-plugin-android-tools without a real device. It is NOT an automation host —
// read_screen returns a canned screen and every other action is acknowledged.
//
// Run:  node examples/mock-host.mjs
// Then: ANDROID_BRIDGE_URL=http://127.0.0.1:37812 ANDROID_BRIDGE_TOKEN=dev-token
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

export const MOCK_SCREEN = [
  'pkg=com.example.mock nodes=3',
  '[1] TextView "Hello from the mock host" @(540,300)',
  '[2] Button "OK" clickable @(540,900)',
].join('\n')

export function startMockHost({ port = 0, token = 'dev-token' } = {}) {
  const server = createServer((request, response) => {
    const reply = (body) => {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(body))
    }
    if (request.method !== 'POST' || !request.url.startsWith('/action')) {
      reply({ ok: false, summary: 'unsupported request' })
      return
    }
    let raw = ''
    request.on('data', (chunk) => (raw += chunk))
    request.on('end', () => {
      if (request.headers['x-android-bridge-token'] !== token) {
        reply({ ok: false, summary: 'unauthorized' })
        return
      }
      let action
      try {
        action = JSON.parse(raw).action
      } catch {
        reply({ ok: false, summary: 'invalid JSON' })
        return
      }
      if (action === 'read_screen') reply({ ok: true, payload: MOCK_SCREEN })
      else if (action) reply({ ok: true, payload: `mock host acknowledged ${action}` })
      else reply({ ok: false, summary: 'missing action' })
    })
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        token,
        close: () => new Promise((done) => server.close(done)),
      })
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port, token } = await startMockHost({
    port: Number(process.env.MOCK_BRIDGE_PORT ?? 37812),
    token: process.env.MOCK_BRIDGE_TOKEN ?? 'dev-token',
  })
  console.log(`mock host on http://127.0.0.1:${port} (token: ${token})`)
}
