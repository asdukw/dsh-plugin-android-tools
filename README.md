# dsh-plugin-android-tools

![test](https://github.com/asdukw/dsh-plugin-android-tools/actions/workflows/test.yml/badge.svg)

[DeepSeek Harness](https://deepseek.com/harness/) (`dsh`) plugin that exposes an Android
device's accessibility layer as agent tools: read the screen, tap nodes/points, type text,
press back, launch apps, and swipe — all through a local HTTP bridge.

[中文说明](README.zh.md)

## Tools

| Tool | Description |
|---|---|
| `read_screen` | Dump the current screen's node tree as lines like `[12] TextView "Send" clickable @(900,2200)` |
| `tap_node(ref)` | Tap a node from the last `read_screen` |
| `tap_point(x,y)` | Tap raw screen coordinates (rarely needed) |
| `type_text(text)` | Write text into the focused input; does not send |
| `press_back` | System back |
| `launch_app(query)` | Launch an app by fuzzy name or package name |
| `swipe(direction)` | Swipe one screen `up` / `down` / `left` / `right` |

The tools are app-agnostic atomic actions; the model composes them into tasks
(read first, act, read again to confirm).

## Install

```bash
dsh plugin add github:asdukw/dsh-plugin-android-tools
# after the first npm release:
dsh plugin add dsh-plugin-android-tools
```

The package ships a `dsh.bundle` layer (`cordis.patch.yml`) that inserts the plugin
row on install. Restart `dsh` afterwards.

## Configuration

The plugin is a client for an HTTP bridge that lives inside the Android app holding
the `AccessibilityService`. It reads two environment variables, injected by the host
app or launcher:

| Variable | Meaning |
|---|---|
| `MEMEX_BRIDGE_URL` | Bridge base URL, e.g. `http://127.0.0.1:37812` |
| `MEMEX_BRIDGE_TOKEN` | Per-process random token |

If either is missing, every tool call fails with
`MEMEX_BRIDGE_URL/TOKEN 未注入`.

## Bridge contract

Any Android app can host the bridge; this plugin only depends on the contract:

```
POST {MEMEX_BRIDGE_URL}/action
header: x-memex-token: <MEMEX_BRIDGE_TOKEN>
body:   { "action": "read_screen" | "tap_node" | "tap_point" | "type_text"
                    | "press_back" | "launch_app" | "swipe",
          ...action args }
```

Success:

```json
{ "ok": true, "payload": "…" }
```

Failure:

```json
{ "ok": false, "summary": "…" }
```

Action args: `tap_node` → `ref` (int); `tap_point` → `x`, `y` (int);
`type_text` → `text` (string); `launch_app` → `query` (string);
`swipe` → `direction` (`up|down|left|right`); `read_screen`, `press_back` → none.

Security properties of the reference bridge: it binds `127.0.0.1` only and
authenticates every request with a per-process random token; it exposes nothing
else. Payloads can contain screen text, so do not log tool results.

## Chat helpers

Chat-page context tracking (`collect_chat` / `read_chat` / `wait`) lives in a
separate plugin: [dsh-plugin-chat-tools](https://github.com/asdukw/dsh-plugin-chat-tools).

## Development

No dependencies needed for the smoke test (a loader stub replaces
`@deepseek-ai/dsh-tools`):

```bash
npm test
```

Release: the first version must be published locally, because npm cannot
configure a trusted publisher for a package that does not exist yet:

1. `npm login` (interactive 2FA), then `npm publish --access public` from this repo.
2. On npmjs.com open the package → Settings → Trusted Publisher → GitHub Actions:
   organization/user `asdukw`, repository `dsh-plugin-android-tools`, workflow
   filename `publish.yml`, allowed action `npm publish`.
3. Bump `version`, commit, tag `v<version>`, push the tag. The `publish` workflow
   then authenticates via GitHub OIDC, attaches provenance automatically and needs
   no secrets.

## License

MIT
