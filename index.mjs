// dsh plugin: expose a device UI automation bridge as agent tools.
//
// Transport: POST {ANDROID_BRIDGE_URL}/action with an x-android-bridge-token
// header. The tools are app-agnostic atomic actions composed by the model;
// chat-page helpers live in dsh-plugin-chat-tools.
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-android-tools'
export const inject = ['tools']

async function call(action, args = {}) {
  const baseUrl = process.env.ANDROID_BRIDGE_URL
  const token = process.env.ANDROID_BRIDGE_TOKEN
  if (!baseUrl || !token) throw new Error('ANDROID_BRIDGE_URL/ANDROID_BRIDGE_TOKEN not set')
  const response = await fetch(`${baseUrl}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-android-bridge-token': token },
    body: JSON.stringify({ action, ...args }),
  })
  const body = await response.json()
  if (body.ok !== true) throw new Error(body.summary ?? `device action failed: ${action}`)
  return body.payload ?? body.summary ?? 'ok'
}

function deviceTool(options) {
  return defineTool({
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return call(options.action, args)
    },
  })
}

export function apply(ctx) {
  ctx.tools.register(
    deviceTool({
      name: 'read_screen',
      action: 'read_screen',
      description:
        '读取当前手机屏幕的控件树，返回形如 "[12] TextView \\"发送\\" clickable @(900,2200)" 的行；'
        + '行首 [n] 是节点编号，用 tap_node 点击它。操作前先读屏，操作后再读一次确认结果。',
      parameters: {},
    }),
  )
  ctx.tools.register(
    deviceTool({
      name: 'tap_node',
      action: 'tap_node',
      description: '点击 read_screen 输出里的节点 [ref]（按节点中心点手势点击）。',
      parameters: {
        ref: { type: 'integer', required: true, description: 'read_screen 输出行首的节点编号' },
      },
    }),
  )
  ctx.tools.register(
    deviceTool({
      name: 'tap_point',
      action: 'tap_point',
      description: '按屏幕坐标点击（极少需要；优先用 tap_node）。',
      parameters: {
        x: { type: 'integer', required: true, description: '横坐标像素' },
        y: { type: 'integer', required: true, description: '纵坐标像素' },
      },
    }),
  )
  ctx.tools.register(
    deviceTool({
      name: 'type_text',
      action: 'type_text',
      description:
        '把文本写进当前聚焦（或第一个可见）的输入框；只输入不发送 —— 发送消息还要再点击"发送"按钮。',
      parameters: {
        text: { type: 'string', required: true, description: '要输入的完整文本' },
      },
    }),
  )
  ctx.tools.register(
    deviceTool({
      name: 'press_back',
      action: 'press_back',
      description: '按系统返回键，用于退出当前页面或取消弹窗。',
      parameters: {},
    }),
  )
  ctx.tools.register(
    deviceTool({
      name: 'launch_app',
      action: 'launch_app',
      description: '按应用名（模糊）或包名启动并切到前台，例如 launch_app("QQ")。',
      parameters: {
        query: { type: 'string', required: true, description: '应用名或包名，如 "QQ" / "com.tencent.mobileqq"' },
      },
    }),
  )
  ctx.tools.register(
    deviceTool({
      name: 'swipe',
      action: 'swipe',
      description: '在屏幕中央向指定方向滑动一屏，用于列表滚动/翻页。',
      parameters: {
        direction: {
          type: 'string',
          required: true,
          enum: ['up', 'down', 'left', 'right'],
          description: '滑动方向：up=内容上滚（手指上滑），down=内容下滚，left/right 同理',
        },
      },
    }),
  )
}
