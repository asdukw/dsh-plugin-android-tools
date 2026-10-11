// dsh plugin: expose a device UI automation bridge as agent tools.
//
// Transport: POST {ANDROID_BRIDGE_URL}/action with an x-android-bridge-token
// header. The tools are app-agnostic atomic actions composed by the model;
// chat/business semantics stay in the caller; this plugin only exposes generic primitives.
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
        + '行首 [n] 是节点编号，用 tap_node 点击它。操作前先读屏，操作后再读一次确认结果。'
        + '若只返回 0-1 个节点，说明该 App 对无障碍隐藏了控件树（实测微信 8.0.78 只在'
        + '「触摸探索」开启后启动的进程里暴露节点）：这时停下手上的操作，不要盲点，'
        + '把情况告诉用户，请他在系统设置 → 应用管理里对该 App 点「强行停止」，'
        + '然后再重新发起任务。',
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
      name: 'long_press',
      action: 'long_press',
      description:
        '长按 read_screen 输出里的节点 [ref]，或长按坐标 (x,y)；优先用 ref。'
        + '长按时间默认 700ms（可选 300–2000ms）。长按后要再读屏确认菜单/选择状态。',
      parameters: {
        ref: { type: 'integer', description: 'read_screen 输出行首的节点编号（优先）' },
        x: { type: 'integer', description: '没有 ref 时的横坐标像素' },
        y: { type: 'integer', description: '没有 ref 时的纵坐标像素' },
        duration_ms: { type: 'integer', description: '长按毫秒数（300–2000，默认 700）' },
      },
    }),
  )
  ctx.tools.register(
    deviceTool({
      name: 'press',
      action: 'press',
      description:
        '按系统键：back=返回/收键盘/取消；home=回桌面；recents=最近任务；enter=触发当前输入框的发送或搜索。'
        + 'Android 没有独立 Esc，取消或退出用 back。',
      parameters: {
        key: {
          type: 'string',
          required: true,
          enum: ['back', 'home', 'recents', 'enter'],
          description: '要按的系统键',
        },
      },
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
