// dsh plugin: expose a device UI automation bridge as agent tools.
//
// Transport: POST {ANDROID_BRIDGE_URL}/action with an x-android-bridge-token
// header. The tools are app-agnostic atomic actions composed by the model;
// chat/business semantics stay in the caller; this plugin only exposes generic primitives.
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-android-tools'
export const inject = ['tools']

/** 调桥并返回整个响应体（截图要拿 summary 之外的 payload）。 */
async function callResult(action, args = {}) {
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
  return body
}

async function call(action, args = {}) {
  const body = await callResult(action, args)
  return body.payload ?? body.summary ?? 'ok'
}

/** 解析帧 payload（capture_frame 的产物）；不是契约形状就回 undefined。 */
function parseFrame(payload) {
  if (typeof payload !== 'string') return undefined
  let parsed
  try {
    parsed = JSON.parse(payload)
  } catch {
    return undefined
  }
  if (typeof parsed?.base64 !== 'string' || typeof parsed?.mediaType !== 'string') return undefined
  // frameId 是坐标的锚点：没有它，图能用但 tap_target 无从下手，按「不是契约形状」处理。
  if (typeof parsed?.frameId !== 'string' || parsed.frameId === '') return undefined
  return parsed
}

/**
 * 给模型看的帧图例。
 *
 * **模型只看得见工具结果里的文本** —— payload 里的尺寸它读不到。所以「图多大、屏多大、
 * 坐标该用哪一套」必须写进这段文字：少了它，模型只能拿图像像素当屏幕像素用（实测会偏 12.6%）。
 */
function frameLegend(frame) {
  const { frameId, width, height, screenWidth, screenHeight } = frame
  const screen = screenWidth && screenHeight ? `｜屏幕 ${screenWidth}×${screenHeight} px` : ''
  return (
    `帧 ${frameId}｜图像 ${width}×${height} px${screen}
`
    + `坐标一律用本帧的**图像像素**：左上 (0,0)、右下 (${width},${height})；`
    + `tap_target / long_press_target 都要带 frame_id="${frameId}"。`
    + '界面变了这一帧就作废，要重新 capture_frame。'
  )
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
        + '若没有任何可读节点（实测微信 8.0.78 对无障碍隐藏控件树），说明这条路在这里走不通：'
        + '改用 capture_frame 取一帧看图，再用 tap_target 按帧坐标点击 —— 不要再试 tap_node。',
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
      name: 'tap_target',
      action: 'tap_target',
      description:
        '点击最近一次 capture_frame 里看到的某个目标：给它在该帧**图像像素**里的外框 (x1,y1)-(x2,y2)，'
        + '执行层取中心换算后下发。坐标是「你在图上看到的那张图」的像素，不是屏幕像素，不要自己换算。'
        + '结果里会说界面有没有变化：没变通常意味着没点中，就重新 capture_frame 再给一次坐标。',
      parameters: {
        frame_id: { type: 'string', required: true, description: 'capture_frame 返回的 frame_id' },
        x1: { type: 'integer', required: true, description: '外框左边界（图像像素）' },
        y1: { type: 'integer', required: true, description: '外框上边界（图像像素）' },
        x2: { type: 'integer', required: true, description: '外框右边界（图像像素）' },
        y2: { type: 'integer', required: true, description: '外框下边界（图像像素）' },
      },
    }),
  )
  ctx.tools.register(
    deviceTool({
      name: 'long_press_target',
      action: 'long_press_target',
      description:
        '长按最近一次 capture_frame 里看到的某个目标，坐标规则与 tap_target 相同（该帧的图像像素外框）。'
        + '长按时间默认 700ms（可选 300–2000ms）。',
      parameters: {
        frame_id: { type: 'string', required: true, description: 'capture_frame 返回的 frame_id' },
        x1: { type: 'integer', required: true, description: '外框左边界（图像像素）' },
        y1: { type: 'integer', required: true, description: '外框上边界（图像像素）' },
        x2: { type: 'integer', required: true, description: '外框右边界（图像像素）' },
        y2: { type: 'integer', required: true, description: '外框下边界（图像像素）' },
        duration_ms: { type: 'integer', description: '长按毫秒数（300–2000，默认 700）' },
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
        '长按 read_screen 输出里的节点 [ref]（按节点中心点长按）。'
        + '长按时间默认 700ms（可选 300–2000ms）。长按后要再读屏确认菜单/选择状态。'
        + '树不可读时改用 long_press_target。',
      parameters: {
        ref: { type: 'integer', required: true, description: 'read_screen 输出行首的节点编号' },
        duration_ms: { type: 'integer', description: '长按毫秒数（300–2000，默认 700）' },
      },
    }),
  )
  ctx.tools.register(
    defineTool({
      name: 'capture_frame',
      description:
        '截取当前屏幕并交给模型一帧：图 + 帧信息（图像尺寸 / 屏幕尺寸 / frame_id）。'
        + '读屏拿不到控件树（返回 0-1 行）、或要看图标/图片/布局细节时用它。'
        + '拿到帧后在图上找到目标，用 tap_target 给出**该帧的图像像素**外框 —— 坐标别自己换算。'
        + '图会占请求预算，优先 read_screen，只在读屏给不出信息时才截。',
      parameters: {},
      output: {
        // dsh 的 value schema DSL 要求对象根显式写死 additionalProperties 的开闭，
        // 漏了会直接抛错 —— 而 defineTool 抛错会让整个插件的工具都注册不上。
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => {
          const blocks = [{ type: 'text', text: value.summary }]
          if (value.attachment) blocks.push({ type: 'image', attachment: value.attachment })
          return blocks
        },
      },
      async execute() {
        const body = await callResult('capture_frame')
        // 宿主没按契约回帧字段时退回纯文字：能截屏但交不了帧的宿主（如 mock）
        // 不该让这个工具直接抛错 —— 只是模型拿不到图，也就无从给坐标。
        const frame = parseFrame(body.payload)
        if (!frame) {
          return { summary: `${body.summary ?? '已取帧'}（宿主未返回帧数据，图没能交给模型）` }
        }
        const legend = frameLegend(frame)
        // 附件服务由运行时挂载（dsh-android-attachments）；没有它就只能退回文字。
        const attachments = typeof ctx.get === 'function' ? ctx.get('attachments') : undefined
        if (!attachments) {
          return { summary: `${legend}
（运行时未挂载附件服务，图没能交给模型）` }
        }
        const attachment = await attachments.saveImage({
          data: Buffer.from(frame.base64, 'base64'),
          mediaType: frame.mediaType,
          name: `frame-${frame.width}x${frame.height}`,
        })
        return { summary: legend, attachment, frame_id: frame.frameId }
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
      description: '在屏幕中央向指定方向滑动约半屏，用于列表滚动/翻页。',
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
