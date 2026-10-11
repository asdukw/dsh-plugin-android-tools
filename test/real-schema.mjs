// 用**真实的** @deepseek-ai/dsh-tools 跑一遍工具定义。
//
// 为什么单靠 smoke.mjs 不够：smoke 用 stub 顶掉了 defineTool，于是工具 schema 的
// 作者侧校验完全没跑。而 dsh 的 value schema DSL 很挑（例如对象根必须显式写
// additionalProperties），defineTool 一抛错，**整个插件注册的工具都会没了** ——
// 实测踩过一次：模型侧看到 0 个工具，只能对着 persona 猜工具名。
//
// 为了让「测的永远是当前源码」，这里自建一个沙箱：把源码拷进去，再用 junction
// 把运行时的 @deepseek-ai/* 接进去（依赖要能解析到缓存，先跑 tools/bundle-dsh.ps1）。
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pluginDir = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url))
const cache = join(repoRoot, 'android', '.dsh-cache', 'runtime')
const vendor = join(cache, 'node_modules', '@deepseek-ai')

const sandbox = mkdtempSync(join(tmpdir(), 'memex-plugin-'))
try {
  const pkgDir = join(sandbox, 'node_modules', 'dsh-plugin-android-tools')
  mkdirSync(pkgDir, { recursive: true })
  copyFileSync(join(pluginDir, 'index.mjs'), join(pkgDir, 'index.mjs'))
  copyFileSync(join(pluginDir, 'package.json'), join(pkgDir, 'package.json'))
  symlinkSync(vendor, join(sandbox, 'node_modules', '@deepseek-ai'), 'junction')

  const plugin = await import(pathToFileURL(join(pkgDir, 'index.mjs')).href)
  assert.equal(plugin.name, 'dsh-android-tools')

  const registered = []
  // 真实 defineTool 在 apply 里逐個编译 schema；抛错就说明工具集会被整锅端掉。
  plugin.apply({ tools: { register: (tool) => registered.push(tool) } })
  assert.equal(registered.length, 9, '9 个工具都要注册成功')

  for (const tool of registered) {
    assert.equal(typeof tool.output.render, 'function', `${tool.name} 要有 render`)
    assert.ok(tool.output.schema?.type, `${tool.name} 的 output schema 要编译出 type`)
    assert.equal(typeof tool.execute, 'function', `${tool.name} 要有 execute`)
  }

  const shot = registered.find((tool) => tool.name === 'screenshot')
  assert.equal(shot.output.schema.type, 'object')
  assert.equal(shot.output.schema.additionalProperties, true, '对象根必须显式开闭')

  // render 是纯函数：附件引用要原样进 image block。
  const withImage = shot.output.render(
    {},
    { summary: '截图 100x50 png 3KB', attachment: { attachmentId: 'a'.repeat(64) } },
  )
  assert.equal(withImage.length, 2)
  assert.equal(withImage[0].type, 'text')
  assert.equal(withImage[1].type, 'image')
  assert.equal(withImage[1].attachment.attachmentId, 'a'.repeat(64))

  // 没有附件服务时退回纯文字，不能抛。
  const textOnly = shot.output.render({}, { summary: '截图（未挂附件服务）' })
  assert.equal(textOnly.length, 1)
  assert.equal(textOnly[0].type, 'text')

  console.log(`ok: ${registered.length} 个工具通过真实 defineTool 校验`)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
