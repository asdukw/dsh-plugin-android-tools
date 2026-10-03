import assert from 'node:assert/strict'
import { register } from 'node:module'

register('./stub-loader.mjs', import.meta.url)

const plugin = await import('../index.mjs')

assert.equal(plugin.name, 'dsh-android-tools')
assert.deepEqual(plugin.inject, ['tools'])

const registered = []
plugin.apply({ tools: { register: (tool) => registered.push(tool) } })

const names = registered.map((tool) => tool.name).sort()
assert.deepEqual(names, [
  'launch_app',
  'press_back',
  'read_screen',
  'swipe',
  'tap_node',
  'tap_point',
  'type_text',
])

for (const tool of registered) {
  assert.equal(typeof tool.execute, 'function', `${tool.name} must have execute`)
  assert.equal(tool.output.schema.type, 'string', `${tool.name} must render a string`)
}

console.log(`ok: ${registered.length} tools registered (${names.join(', ')})`)
