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
  'long_press',
  'press',
  'read_screen',
  'screenshot',
  'swipe',
  'tap_node',
  'tap_point',
  'type_text',
])

// 文本工具回字符串；screenshot 回对象（summary + 附件引用），render 里再出图。
const OBJECT_OUTPUT = new Set(['screenshot'])
for (const tool of registered) {
  assert.equal(typeof tool.execute, 'function', `${tool.name} must have execute`)
  const expected = OBJECT_OUTPUT.has(tool.name) ? 'object' : 'string'
  assert.equal(tool.output.schema.type, expected, `${tool.name} must render a ${expected}`)
}

console.log(`ok: ${registered.length} tools registered (${names.join(', ')})`)
