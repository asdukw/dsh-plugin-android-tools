# dsh-plugin-android-tools

![test](https://github.com/asdukw/dsh-plugin-android-tools/actions/workflows/test.yml/badge.svg)

[DeepSeek Harness](https://deepseek.com/harness/) (`dsh`) plugin that turns a device UI
automation bridge into agent tools: read the screen, capture frames, tap nodes/targets,
long press, type text, press system keys, launch apps and swipe.

This plugin is a thin, platform-independent HTTP client: it registers the tools and
forwards each call to a **bridge host** that implements the contract below. Reading the
UI tree and injecting gestures stays in the host. A reference host runs on Android with
an `AccessibilityService`, but any system that speaks the contract works with the same
plugin.

[中文说明](README.zh.md)

## Requirements

- `dsh` running with `@deepseek-ai/dsh-tools` >= `0.1.0-rc.6` (peer dependency).
- **A bridge host**: this repository ships the client half only — no host is published
  here. Point the plugin at an existing host, or implement the small contract below
  (see [Writing a host](#writing-a-host)); a runnable mock host is included for
  testing. Without a host, tool calls fail with a clear error.

## Tools

| Tool | Description |
|---|---|
| `read_screen` | Dump the current screen's node tree as lines like `[12] TextView "Send" clickable @(900,2200)` |
| `tap_node(ref)` | Tap a node from the last `read_screen` |
| `capture_frame()` | Capture a **frame**: the image plus its frame info (image/screen size, `frame_id`) |
| `tap_target(frame_id,x1,y1,x2,y2)` | Tap a target you saw in that frame — bbox in **image pixels**, the host converts |
| `long_press_target(frame_id,x1,y1,x2,y2,duration_ms?)` | Long-press a frame target (default 700 ms, 300-2000 ms) |
| `long_press(ref,duration_ms?)` | Long-press a node from the last `read_screen` |
| `type_text(text)` | Write text into the focused input; does not send |
| `press(key)` | Press `back` / `home` / `recents` / `enter`; use `back` for Esc-like cancel/exit |
| `launch_app(query)` | Launch an app by fuzzy name or package name |
| `swipe(direction)` | Swipe about half a screen `up` / `down` / `left` / `right` |

A `capture_frame` image only reaches the model through the **attachment service**
(`ctx.attachments`): the tool persists the bytes and returns an image content block. Without a
mounted attachment service it degrades to text (the call still succeeds, the image does not reach
the model) instead of failing. A bridge host just returns
`{ mediaType, width, height, base64 }` as the action `payload`.

The tools are app-agnostic atomic actions; the model composes them into tasks.

## Install

```bash
# from git, pinned to a release tag:
dsh plugin add github:asdukw/dsh-plugin-android-tools#v0.3.0

# or from the tarball attached to any GitHub Release:
dsh plugin add ./dsh-plugin-android-tools-0.3.0.tgz

# once npm publishing is enabled:
dsh plugin add dsh-plugin-android-tools
```

The package ships a `dsh.bundle` layer (`cordis.patch.yml`) that inserts the plugin row
on install. Restart `dsh` afterwards.

## Configure

| Variable | Meaning |
|---|---|
| `ANDROID_BRIDGE_URL` | Bridge base URL, e.g. `http://127.0.0.1:37812` |
| `ANDROID_BRIDGE_TOKEN` | Shared token checked on every request, usually random per host start |

The host app or launcher normally injects both variables; they can also be exported
manually in the environment that starts `dsh`. If either is missing, every tool call
fails with `ANDROID_BRIDGE_URL/ANDROID_BRIDGE_TOKEN not set`.

## Usage

The intended loop is **read first, act, read again to confirm**:

```text
User: open the clock app and set a 5 minute timer
Agent: launch_app("Clock") → read_screen → tap_node(12) → type_text("5") → …
```

To try the plugin without a device, run the bundled mock host (canned screen, no
device needed):

```bash
node examples/mock-host.mjs   # mock host on http://127.0.0.1:37812 (token: dev-token)
export ANDROID_BRIDGE_URL=http://127.0.0.1:37812
export ANDROID_BRIDGE_TOKEN=dev-token
```

The mock acknowledges every action and returns a canned `read_screen`.

## Bridge contract

```
POST {ANDROID_BRIDGE_URL}/action
header: x-android-bridge-token: <ANDROID_BRIDGE_TOKEN>
body:   { "action": "read_screen" | "tap_node" | "long_press"
                    | "capture_frame" | "tap_target" | "long_press_target"
                    | "type_text" | "press" | "launch_app" | "swipe",
          ...action args }
```

Success: `{ "ok": true, "payload": "…" }` — failure: `{ "ok": false, "summary": "…" }`.

| Action | Args | Payload |
|---|---|---|
| `read_screen` | – | node-tree text, one node per line (`[ref] ClassName "text" [flags] @(x,y)`) |
| `tap_node` | `ref` (integer) | result summary |
| `tap_target` | `frame_id`, `x1`, `y1`, `x2`, `y2` (image pixels) | result summary; `changed` says whether the screen moved |
| `long_press_target` | same as `tap_target`, plus optional `duration_ms` | result summary; `changed` |
| `long_press` | `ref`, plus optional `duration_ms` | result summary |
| `type_text` | `text` (string) | result summary |
| `press` | `key` (`back` / `home` / `recents` / `enter`) | result summary |
| `launch_app` | `query` (string) | result summary |
| `swipe` | `direction` (`up` / `down` / `left` / `right`) | result summary |
| `capture_frame` | – | JSON string `{ "mediaType", "width", "height", "frameId", "screenWidth", "screenHeight", "offsetX", "offsetY", "base64" }` |

`press_back` remains an optional legacy bridge alias for `press(back)`, but it is not
registered as a model tool. Keep the bridge local (e.g. loopback) and token-checked:
screen content can be personal data, and the bridge can drive the device. Payloads are
only returned to the model; do not log them.

## Writing a host

A host is any process that can read the UI and inject input. The contract above is the
entire interface:

| Where the host runs | Typical building blocks |
|---|---|
| Android | `AccessibilityService` (`getRootInActiveWindow`, `dispatchGesture`, `ACTION_SET_TEXT`, …) |
| Windows | UI Automation |
| macOS | Accessibility API (`AXUIElement`) |
| iOS | WebDriverAgent / XCTest |
| Anything else | whatever can produce `read_screen` text and accept taps |

Checklist:

- listen on loopback (or authenticate hard) and verify `x-android-bridge-token` on
  every request;
- map `action` + args to the platform primitives and return `{ok, payload}` or
  `{ok, summary}`;
- `read_screen` must emit one line per interesting node in the documented format — the
  model relies on `[ref]` staying stable until the next read so `tap_node` works;
- keep ROM/OEM quirks inside the host so the tool surface never changes.

`examples/mock-host.mjs` is a ~60-line reference for the parsing/auth/reply shape.

## Platform notes

- The plugin contains no OS-specific code — it only speaks HTTP. Porting to another
  platform means writing a bridge host, not changing the plugin.
- ROM/OEM behaviour (accessibility permissions, gesture injection quirks, node-tree
  differences) belongs behind the bridge, so the tool surface stays stable.

## Generic boundary

This plugin intentionally exposes only app-agnostic primitives. Chat, shopping, settings
and other business flows are composed by the model; no page-specific tool is built in.

## Development

No dependencies needed for the smoke test (a loader stub replaces
`@deepseek-ai/dsh-tools`):

```bash
npm test
```

Release: push a `v*` tag. The `release` workflow runs the tests, packs the package and
creates a GitHub Release with the `.tgz` attached. npm publishing is prepared as a
gated job: publish the first version locally (`npm login`, then `npm publish --access
public`), add a trusted publisher on npmjs.com (package → Settings → Trusted Publisher
→ GitHub Actions: user `asdukw`, repository `dsh-plugin-android-tools`, workflow
filename `release.yml`, allowed action `npm publish`), then enable the job:

```bash
gh variable set NPM_PUBLISH_READY --body true -R asdukw/dsh-plugin-android-tools
```

## License

MIT
