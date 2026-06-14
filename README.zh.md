# AI Chat Multiplexer

一个桌面工作区应用，用于并排运行多个 AI 聊天会话，并提供类似 Chrome Profile 的隔离配置，以便同时使用多个账号。

![Status](https://img.shields.io/badge/status-active-success) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![React](https://img.shields.io/badge/React-19-blue) ![License](https://img.shields.io/badge/license-MIT-green)

语言：[English](./README.md) · [Tiếng Việt](./README.vi.md) · [中文](./README.zh.md)

---

## 概览

AI Chat Multiplexer 是一个 local-first 桌面应用，适合经常同时使用多个 AI 工具的人。你不需要在浏览器里打开一堆混乱的标签页，而是可以把一个桌面窗口分成多个 pane，并排运行 Claude、ChatGPT、Gemini、Perplexity、DeepSeek、本地工具或任意 URL。

应用使用真正的 Tauri native webview，而不是 iframe。因此，即使现代 AI 网站禁止 iframe 嵌入，也可以在桌面应用中正常运行。

---

## 为什么需要它？

使用 AI 工作时，经常会遇到这些场景：

- 向多个模型询问同一个问题；
- 一个 AI 在写作，另一个 AI 在调研；
- 对比 Work 和 Personal 账号；
- 等待长回复时切换到其他任务；
- 为不同项目保留多个上下文。

普通浏览器标签页很快会变得混乱。AI Chat Multiplexer 把类似 terminal multiplexer 的工作方式带到 AI workflow：多个 pane、多个 tab、独立 profile、一个专注的 workspace。

---

## 核心功能

### Workspaces

- 创建多个 workspace，例如 `Work`、`Personal`、`Research` 或按项目划分。
- 每个 workspace 拥有自己的 pane 布局。
- 在应用内重命名或删除 workspace。
- 重新打开应用时恢复状态。

### 灵活布局

- 单 pane Focus mode。
- 2 列、3 列、4 列布局。
- 列数会根据 pane 数量自动限制。
- 拖拽 pane 重新排序。
- 放大某个 pane，同时保留当前 workspace。

### 类 Chrome Profile

Profile 是浏览器 session 容器，而不是针对某个 AI provider 的 preset。

- 每个 profile 都有独立的 cookie/storage/session 目录。
- 可以使用 `Work`、`Personal` 或任意自定义名称。
- 多个 pane 使用同一个 profile 时会共享登录/session。
- 不同 profile 之间账号完全隔离。
- 关闭 pane 不会删除 profile/session。
- 正在被 pane 使用的 profile 不能删除。

### Pane 内部 Tabs

- 每个 pane 支持多个 tab。
- 每个 tab 拥有自己的 URL、title、favicon 和 loading 状态。
- 地址栏支持直接 URL、localhost 和搜索查询。
- 当前 tab 支持 back、forward、reload。
- 支持拖拽重新排序 tab。
- 当两个 pane 使用相同 profile 时，可以跨 pane 移动 tab。
- 可以把 tab detach 成新的 pane。

### Native webview engine

许多 AI 网站通过 `X-Frame-Options` 或 CSP 禁止 iframe。AI Chat Multiplexer 使用 Tauri native child webview 来绕开这个限制。

工作方式：

1. React 为 active pane 渲染一个空的 `webview-shell`。
2. React 测量该 shell 的位置和大小。
3. Tauri 创建或移动 native webview，使其与 shell 对齐。
4. Webview 使用所选 profile 的 session directory。
5. 当 menu、modal、download panel 或 drag overlay 打开时，native webview 会被隐藏，避免覆盖 React UI。

### Downloads

- native webview 内发起的下载由 Rust/Tauri 处理。
- 应用显示 download toast。
- 下载完成后可以打开文件或打开所在文件夹。
- 包含针对 Windows WebView2 download finished 事件不稳定的 workaround。

### Backup / Restore

- 以 JSON 导出/导入应用配置。
- Full backup 可包含 profile session/cookie ZIP。
- 从 ZIP 恢复 session。

> **安全提示：** full backup 可能包含登录 cookie/session。请将其视为私密数据，不要分享。

### Updates

- 应用可检查最新 GitHub release。
- 如果有新版本，会打开 release 页面。

---

## 技术栈

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 |
| Desktop runtime | Tauri 2 |
| Native backend | Rust |
| State storage | `localStorage` |
| Browser session storage | Tauri webview `data_directory` per profile |
| Styling | Plain CSS |
| Tests | Vitest + Testing Library + jsdom |
| Icons | Inline custom SVG components |

---

## 项目结构

```text
.
├── src/
│   ├── App.tsx                         # Composition root
│   ├── appCore.ts                      # Types, constants, helpers, migrations
│   ├── newtab.ts                       # New-tab URL helpers
│   ├── main.tsx                        # React entrypoint
│   ├── App.css                         # Theme and layout styles
│   ├── Icons.tsx                       # Inline SVG icons
│   ├── components/                     # UI components
│   ├── hooks/                          # State/effects/actions hooks
│   └── types/
├── src-tauri/
│   ├── src/lib.rs                      # Tauri commands and native backend
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── tauri.conf.json
├── public/
├── scripts/
├── package.json
└── README.md
```

---

## 架构

### Data model

```text
AppState
├── workspaces[]
│   └── panes[]
│       └── tabs[]
└── profiles[]
```

含义：

- Workspace：独立工作空间和布局。
- Pane：一个 browser/chat 区域。
- Tab：同一个 pane 内的多个页面/聊天。
- Profile：独立 cookie/session 容器。

### URL 字段语义

应用区分“主动加载的 URL”和“从 webview 观察到的 URL”：

- `loadedUrl`：应用最后一次明确要求 native webview 加载的 URL。
- `currentUrl`：native webview 在 redirect 或 SPA route change 后报告的 URL。
- 地址栏显示 observed URL，但 SPA route change 不能反向触发 `load_url`，否则 Gemini 等 SPA 可能 reload 并丢失页面内状态。

### Native webview lifecycle

```text
React Pane
  └── webview-shell DOM rectangle
        ↓
useNativeWebviews
  └── native_webview_upsert(profileId, label, url, x, y, width, height)
        ↓
Rust/Tauri
  └── WebviewBuilder::new(label, url)
      .data_directory(profile_session_directory)
      .enable_clipboard_access()
```

Native webview label 基于 tab ID，因此移动 tab 时不会销毁 webview/session。

### Profile session isolation

每个 profile 映射到独立 session 目录：

```text
app_data_dir/pane-sessions/<profile_id>/
```

cookie、localStorage、IndexedDB、cache 和登录 session 都按 profile 隔离。

---

## 关键不变量

修改应用时必须保持这些规则：

1. Native webview label 必须对同一个 tab 保持稳定。
2. Profile ID 必须映射到独立的 `data_directory`。
3. Pane 不应永久为空。
4. Workspace 必须有有效的 active fallback。
5. 只有相同 profile 的 pane 之间才允许跨 pane 移动 tab。
6. menu/modal/download panel/drag overlay 打开时必须隐藏 native webview。
7. 被动 native status polling 不能触发 reload。
8. State migration 必须保留用户数据。

---

## 系统要求

### 通用

- Node.js 20+ 推荐
- npm
- Rust stable
- Tauri 支持的桌面环境

### Windows

- Windows 10/11
- Microsoft Edge WebView2 Runtime
- Visual Studio 2022 Build Tools with C++ workload
- Rust MSVC toolchain

### Linux/WSL

```bash
sudo apt-get update
sudo apt-get install -y \
  libdbus-1-dev \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev
```

---

## 安装与运行

安装依赖：

```bash
npm install
```

运行 web-only dev mode：

```bash
npm run dev
```

运行 desktop dev mode：

```bash
npm run tauri dev
```

构建 frontend：

```bash
npm run build
```

构建 desktop app：

```bash
npm run tauri build
```

---

## Testing

运行完整测试：

```bash
npm test
```

Watch mode：

```bash
npm run test:watch
```

Vitest UI：

```bash
npm run test:ui
```

测试覆盖 state helpers、migrations、pane/tab behavior、native webview sync、backup/update、download manager 和 components。

---

## Manual desktop smoke test

1. 打开 desktop app。
2. 用同一个 profile 打开两个 pane，确认 session 共享。
3. 用不同 profile 打开两个 pane，确认登录状态隔离。
4. 打开 Gemini，创建新聊天，输入一条消息，确认不会 flicker/reload 导致 conversation 丢失。
5. webview 可见时打开 Settings，确认 modal 不被遮挡。
6. 拖拽 pane，确认 webview 正确隐藏/重新显示。
7. 在 pane 内拖拽 tab。
8. 在相同 profile 的 pane 之间拖拽 tab。
9. 确认不同 profile 之间不能移动 tab。
10. 下载文件并检查 toast/open/reveal。
11. 导出 config JSON。
12. 在测试环境中执行 full backup/restore。

---

## Build outputs

Tauri build artifacts 位于：

```text
src-tauri/target/release/bundle/
```

Windows 通常包含：

```text
src-tauri/target/release/bundle/nsis/*.exe
src-tauri/target/release/bundle/msi/*.msi
```

---

## 安全模型

- 外部网站运行在 native webview 中。
- Profile 通过独立 data directory 隔离 browser storage。
- Full backup 可能包含 cookie/session，应视为私密数据。
- Tauri config 中关闭 CSP 是为了支持任意外部网站，这是 browser-shell app 的有意 tradeoff。
- 不要向不可信外部 web content 暴露 privileged Tauri commands。

---

## Troubleshooting

### 网站在 web dev mode 中无法渲染

很多 AI 网站会阻止 iframe，这是正常现象。请使用 desktop mode：

```bash
npm run tauri dev
```

### WSL 中 npm binaries 报 Permission denied

```bash
chmod +x node_modules/.bin/vitest node_modules/.bin/tsc node_modules/.bin/vite node_modules/.bin/tauri
```

### 缺少 Rollup optional dependency

```bash
npm install
```

### Linux build 缺少 `dbus-1` 或 `webkit2gtk-4.1`

安装 Linux/WSL requirements 中列出的系统包。

---

## 版本

Current app version: `0.1.5`

---

## 作者

Made by **An** with AI-assisted development.

---

## License

MIT — see [LICENSE](./LICENSE).
