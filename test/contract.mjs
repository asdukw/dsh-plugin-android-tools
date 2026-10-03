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
assert.equal(await tools.get('type_text').execute({ text: 'hi' }), 'mock host acknowledged type_text')

process.env.ANDROID_BRIDGE_TOKEN = 'wrong'
await assert.rejects(() => tools.get('press_back').execute({}), /unauthorized/)

await host.close()
delete process.env.ANDROID_BRIDGE_URL
delete process.env.ANDROID_BRIDGE_TOKEN
await assert.rejects(() => tools.get('read_screen').execute({}), /not set/)

console.log('ok: bridge contract round-trip')
