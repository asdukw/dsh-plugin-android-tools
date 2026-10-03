# dsh-plugin-android-tools

![test](https://github.com/asdukw/dsh-plugin-android-tools/actions/workflows/test.yml/badge.svg)

[DeepSeek Harness](https://deepseek.com/harness/)（`dsh`）插件：把 Android 设备的无障碍
执行层注册成 agent 工具 —— 读屏、点节点/坐标、输入文本、返回、启动应用、滑动，
全部经本地 HTTP 桥完成。

[English](README.md)

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

工具是与具体 App 无关的原子动作，由模型组合成任务（先读屏、操作、再读屏确认）。

## 安装

```bash
dsh plugin add github:asdukw/dsh-plugin-android-tools
# npm 首次发布后也可以：
dsh plugin add dsh-plugin-android-tools
```

包内声明了 `dsh.bundle` 层（`cordis.patch.yml`），安装时自动插入插件行；之后重启 `dsh`。

## 配置

本插件是宿主 Android App 内 HTTP 桥的客户端，从环境变量读取两个值（由宿主 App / 启动器注入）：

| 变量 | 含义 |
|---|---|
| `MEMEX_BRIDGE_URL` | 桥的基础地址，如 `http://127.0.0.1:37812` |
| `MEMEX_BRIDGE_TOKEN` | 每次进程启动随机生成的 token |

任一缺失时所有工具调用以 `MEMEX_BRIDGE_URL/TOKEN 未注入` 失败。

## 桥契约

任何 Android App 都可以实现该桥；本插件只依赖契约：

```
POST {MEMEX_BRIDGE_URL}/action
header: x-memex-token: <MEMEX_BRIDGE_TOKEN>
body:   { "action": "read_screen" | "tap_node" | "tap_point" | "type_text"
                    | "press_back" | "launch_app" | "swipe",
          ...动作参数 }
```

成功：

```json
{ "ok": true, "payload": "…" }
```

失败：

```json
{ "ok": false, "summary": "…" }
```

动作参数：`tap_node` → `ref`（整数）；`tap_point` → `x`、`y`（整数）；
`type_text` → `text`（字符串）；`launch_app` → `query`（字符串）；
`swipe` → `direction`（`up|down|left|right`）；`read_screen`、`press_back` 无参数。

参考实现的桥只监听 `127.0.0.1`，每个请求都校验进程随机 token；读屏结果可能包含屏幕文本，
不要把它写进日志。

## 聊天辅助

聊天页上下文跟踪（`collect_chat` / `read_chat` / `wait`）在独立插件：
[dsh-plugin-chat-tools](https://github.com/asdukw/dsh-plugin-chat-tools)。

## 开发

烟测无需安装依赖（用 loader stub 顶替 `@deepseek-ai/dsh-tools`）：

```bash
npm test
```

发布：改 `version`、提交、打 `v<version>` tag 并推送。`publish` workflow 会先跑测试，
再带 provenance 发布到 npm；仓库需要一个有发布权限的 `NPM_TOKEN` secret。

## 许可

MIT
