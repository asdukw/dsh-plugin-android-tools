# dsh-plugin-android-tools

![test](https://github.com/asdukw/dsh-plugin-android-tools/actions/workflows/test.yml/badge.svg)

[DeepSeek Harness](https://deepseek.com/harness/)（`dsh`）插件：把设备 UI 自动化桥变成
agent 工具 —— 读屏、点节点/坐标、输入文本、返回、启动应用、滑动。

插件本身是一个**平台无关**的薄 HTTP 客户端：它只注册工具并把调用转发给实现下方契约的
**桥宿主**；读控件树、注入手势等设备相关工作都在宿主里。参考宿主运行在 Android 上
（`AccessibilityService`），但任何实现该契约的系统都能用同一个插件。

[English](README.md)

## 前置条件

- 运行中的 `dsh`，带 `@deepseek-ai/dsh-tools` >= `0.1.0-rc.6`（peer dependency）。
- **一个桥宿主**：本仓库只发布客户端这一半，宿主不在这里发布。可以对接已有宿主，
  或按下方契约实现（见[编写宿主](#编写宿主)）；仓库内附带一个可运行的 mock 宿主
  用于测试。没有宿主时，工具调用会以明确错误失败。

## 工具

| 工具 | 说明 |
|---|---|
| `read_screen` | 读取当前屏幕控件树，输出形如 `[12] TextView "发送" clickable @(900,2200)` 的行 |
| `tap_node(ref)` | 点击上次 `read_screen` 输出里的节点 |
| `tap_point(x,y)` | 按屏幕坐标点击（极少需要） |
| `type_text(text)` | 把文本写进当前聚焦输入框；只输入不发送 |
| `press_back` | 系统返回键 |
| `launch_app(query)` | 按应用名（模糊）或包名启动 |
| `swipe(direction)` | 向 `up` / `down` / `left` / `right` 滑动一屏 |

工具是与具体 App 无关的原子动作，由模型组合成任务。

## 安装

```bash
# 从 git 安装，锁定 release tag：
dsh plugin add github:asdukw/dsh-plugin-android-tools#v0.2.0

# 或安装任意 GitHub Release 附带的 tarball：
dsh plugin add ./dsh-plugin-android-tools-0.2.0.tgz

# npm 发布启用后也可以：
dsh plugin add dsh-plugin-android-tools
```

包内声明了 `dsh.bundle` 层（`cordis.patch.yml`），安装时自动插入插件行；之后重启 `dsh`。

## 配置

| 变量 | 含义 |
|---|---|
| `ANDROID_BRIDGE_URL` | 桥的基础地址，如 `http://127.0.0.1:37812` |
| `ANDROID_BRIDGE_TOKEN` | 每个请求校验的共享 token，通常由宿主每次启动随机生成 |

宿主 App 或启动器一般会注入这两个变量；也可以在启动 `dsh` 的环境里手动导出。
任一缺失时所有工具调用以 `ANDROID_BRIDGE_URL/ANDROID_BRIDGE_TOKEN not set` 失败。

## 使用

推荐的循环是**先读屏、操作、再读屏确认**：

```text
User: 打开时钟应用，设置一个 5 分钟计时器
Agent: launch_app("Clock") → read_screen → tap_node(12) → type_text("5") → …
```

想在没有真机的情况下试跑，用仓库自带的 mock 宿主（固定屏幕、无需设备）：

```bash
node examples/mock-host.mjs   # mock host on http://127.0.0.1:37812 (token: dev-token)
export ANDROID_BRIDGE_URL=http://127.0.0.1:37812
export ANDROID_BRIDGE_TOKEN=dev-token
```

mock 会确认所有动作，并为 `read_screen` 返回一份固定控件树。

## 桥契约

```
POST {ANDROID_BRIDGE_URL}/action
header: x-android-bridge-token: <ANDROID_BRIDGE_TOKEN>
body:   { "action": "read_screen" | "tap_node" | "tap_point" | "type_text"
                    | "press_back" | "launch_app" | "swipe",
          ...动作参数 }
```

成功：`{ "ok": true, "payload": "…" }`；失败：`{ "ok": false, "summary": "…" }`。

| 动作 | 参数 | payload |
|---|---|---|
| `read_screen` | – | 控件树文本，一行一个节点（`[ref] 类名 "文本" [flags] @(x,y)`） |
| `tap_node` | `ref`（整数） | 结果摘要 |
| `tap_point` | `x`、`y`（整数） | 结果摘要 |
| `type_text` | `text`（字符串） | 结果摘要 |
| `press_back` | – | 结果摘要 |
| `launch_app` | `query`（字符串） | 结果摘要 |
| `swipe` | `direction`（`up` / `down` / `left` / `right`） | 结果摘要 |

桥应只监听本地（如 loopback）并校验 token：读屏内容可能包含个人数据，桥还能驱动设备。
payload 只交给模型，不要写日志。

## 编写宿主

宿主就是任何能读 UI、注入输入的进程；上方契约就是全部接口：

| 宿主所在平台 | 典型构件 |
|---|---|
| Android | `AccessibilityService`（`getRootInActiveWindow`、`dispatchGesture`、`ACTION_SET_TEXT` 等） |
| Windows | UI Automation |
| macOS | Accessibility API（`AXUIElement`） |
| iOS | WebDriverAgent / XCTest |
| 其他 | 任何能产出 `read_screen` 文本并接受点击的系统 |

检查清单：

- 只监听 loopback（或做强鉴权），每个请求校验 `x-android-bridge-token`；
- 把 `action` + 参数映射到平台原语，返回 `{ok, payload}` 或 `{ok, summary}`；
- `read_screen` 按文档格式一行一个有效节点 —— 模型依赖 `[ref]` 在下一次读屏前保持
  稳定，`tap_node` 才能点中；
- ROM/OEM 怪癖都留在宿主里，工具接口保持不变。

`examples/mock-host.mjs` 是约 60 行的参考实现（解析/鉴权/回包形状）。

## 平台说明

- 插件里没有任何 OS 相关代码 —— 只说 HTTP。要移植到别的平台，写一个桥宿主即可，
  插件本身不用改。
- ROM/OEM 差异（无障碍权限、手势注入怪癖、控件树差异）都放在桥后面，工具接口保持稳定。

## 聊天辅助

聊天页上下文跟踪（`collect_chat` / `read_chat` / `wait`）在独立插件：
[dsh-plugin-chat-tools](https://github.com/asdukw/dsh-plugin-chat-tools)。

## 开发

烟测无需安装依赖（用 loader stub 顶替 `@deepseek-ai/dsh-tools`）：

```bash
npm test
```

发布：推 `v*` tag。`release` workflow 会跑测试、打包，并创建附带 `.tgz` 的 GitHub
Release。npm 发布是同一 workflow 里的 gated job：先本地发首个版本（`npm login` 后
`npm publish --access public`），在 npmjs.com 添加 trusted publisher（package →
Settings → Trusted Publisher → GitHub Actions：user `asdukw`、repository
`dsh-plugin-android-tools`、workflow filename `release.yml`、允许 `npm publish`），
然后启用：

```bash
gh variable set NPM_PUBLISH_READY --body true -R asdukw/dsh-plugin-android-tools
```

## 许可

MIT
