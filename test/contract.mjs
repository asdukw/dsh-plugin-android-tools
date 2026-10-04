import assert from 'node:assert/strict'
import { register } from 'node:module'
import { startMockHost } from '../examples/mock-host.mjs'

register('./stub-loader.mjs', import.meta.url)

const host = await startMockHost()

process.env.ANDROID_BRIDGE_URL = `http://127.0.0.1:${host.port}`
process.env.ANDROID_BRIDGE_TOKEN = host.token

const plugin = await import('../index.mjs')
const tools = new Map()
plugin.apply({ tools: { register: (tool) => tools.set(tool.name, tool) } })

const screen = await tools.get('read_screen').execute({})
assert.match(screen, /mock host/, 'read_screen must return the host payload')
assert.equal(await tools.get('tap_node').execute({ ref: 2 }), 'mock host acknowledged tap_node')
assert.equal(
  await tools.get('long_press').execute({ ref: 2, duration_ms: 700 }),
  'mock host acknowledged long_press',
)
assert.equal(await tools.get('type_text').execute({ text: 'hi' }), 'mock host acknowledged type_text')

const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (callback) => {
  callback()
  return 0
}
assert.equal(await tools.get('wait').execute({ seconds: 10 }), 'waited 10s')
globalThis.setTimeout = realSetTimeout

process.env.ANDROID_BRIDGE_TOKEN = 'wrong'
await assert.rejects(() => tools.get('press').execute({ key: 'back' }), /unauthorized/)

await host.close()
delete process.env.ANDROID_BRIDGE_URL
delete process.env.ANDROID_BRIDGE_TOKEN
await assert.rejects(() => tools.get('read_screen').execute({}), /not set/)

console.log('ok: bridge contract round-trip')
