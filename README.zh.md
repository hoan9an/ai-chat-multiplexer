# AI Chat Multiplexer

一个 local-first 桌面指挥中心，用来并排比较、调度并保留多个 AI 聊天会话。

![Status](https://img.shields.io/badge/status-active-success) ![Version](https://img.shields.io/badge/version-0.1.10-blue) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![React](https://img.shields.io/badge/React-19-blue) ![License](https://img.shields.io/badge/license-MIT-green)

语言：[English](./README.md) · [Tiếng Việt](./README.vi.md) · [中文](./README.zh.md)

---

## 一个 workspace，容纳所有 AI 对话。

AI Chat Multiplexer 把桌面变成一个专注的 AI 工作控制台：一个 pane 里打开 Claude，另一个 pane 里打开 ChatGPT，Gemini 放在研究工具旁边，同时 Work/Personal 账号保持安全隔离。

不再到处找浏览器标签页。不再反复登录退出。不再因为某个模型还在思考而丢掉上下文。

![AI Chat Multiplexer 桌面 workspace 预览](./docs/assets/ai-multiplexer-hero.png)

<p align="center">
  <a href="https://github.com/hoan9an/ai-chat-multiplexer/releases/latest"><strong>下载最新版本</strong></a>
  ·
  <a href="https://github.com/hoan9an/ai-chat-multiplexer/releases/tag/v0.1.10">查看 v0.1.10</a>
  ·
  <a href="#quick-start">从源码运行</a>
</p>

---

## 为 AI 重度使用者的真实工作流而设计

现代 AI 工作很少只靠一个聊天窗口完成。你会比较答案、并行运行 prompt、保留项目上下文，并在多个账号之间切换。普通浏览器标签页可以做到一部分，但很快会变得混乱且脆弱。

AI Chat Multiplexer 把 terminal multiplexer 式的工作方式带到 AI workflow：

- 向多个模型提出同一个问题，并实时对比回答；
- 把研究、写作、编码和 review 聊天放在同一个视野里；
- 用独立 profile 隔离客户、工作、个人和实验账号；
- 重启应用后继续保留重要会话；
- 通过 native Tauri webview 使用那些禁止 iframe 嵌入的 AI 网站。

---

## 亮点功能

### 多 pane AI workspace

把一个桌面窗口拆成多个专注 pane。支持 focus mode、2 列、3 列、4 列布局，并可拖拽 pane，让界面贴合你的工作节奏。

### 类 Chrome 的 profile 隔离

Profile 是真正的浏览器 session 容器。每个 profile 都有自己的 cookie、storage、cache 和登录 session，因此 Work 和 Personal 账号可以同时登录且互不串扰。

### 每个 pane 内都有 tabs

每个 pane 可以包含多个 tab，每个 tab 都有独立的 URL、title、favicon 和 loading 状态。你可以重新排序 tab，在相同 profile 的 pane 之间移动 tab，或把 tab detach 成新的 pane。

### Native webview，而不是脆弱 iframe

许多 AI 服务会通过 CSP 或 `X-Frame-Options` 阻止 iframe。AI Chat Multiplexer 使用 Tauri native child webview，让这些网站像正常桌面浏览器界面一样运行。

### Local-first 状态

Workspaces、panes、tabs、profiles、theme 和 layout 都存储在本地。这个应用是你所选择服务的桌面 shell，而不是托管你的聊天内容的代理服务。

### Backup / Restore

支持以 JSON 导出/导入配置，也可以创建 full ZIP backup，包含 workspace、pane、tab、profile 映射和 profile session 文件。Full backup 可能包含 cookie/session，应当作为私密数据保护。Session restore 是 best-effort；跨机器或跨 Windows 用户时，受保护网站仍可能要求重新登录。

### 支持 auto-update

Desktop app 可以检查 GitHub releases。已签名版本可以通过 Tauri updater 下载、安装并 relaunch；fallback 环境会打开 release 页面。

---

## 常见工作流

| Workflow | AI Chat Multiplexer 如何帮助你 |
|---|---|
| 模型对比 | 并排打开 Claude、ChatGPT、Gemini 和 Perplexity，询问同一个问题。 |
| 研究 + 写作 | 让研究 pane 保持可见，同时让另一个 AI 写作、修改或总结。 |
| 账号隔离 | 使用 Work、Personal、Client 或 Lab profiles，保持独立登录 session。 |
| 长时间 prompt | 一个模型思考时，你可以继续在另一个 pane 工作。 |
| 项目上下文 | 为客户、repo、主题或实验创建独立 workspace。 |
| 本地工具 | 把 localhost app、docs、dashboard 或本地 AI 工具放在 hosted AI chat 旁边。 |

---

## 隐私与安全模型

AI Chat Multiplexer 采用 local-first 设计：

- 外部 AI 网站运行在 native desktop webview 中；
- browser storage 通过独立 data directory 按 profile 隔离；
- workspace 状态存储在本地；
- full backup 可能包含敏感 session 文件，应按私密数据处理；
- session restore 不会解密、导出或绕过 cookie、token、DPAPI、app-bound encryption 或网站保护机制。

由于这是 browser-shell 类型的桌面应用，请只使用可信服务，并避免把 privileged Tauri commands 暴露给不可信 web content。

---

## Quick start

### 下载应用

从 GitHub Releases 获取最新安装包：

- Latest release: <https://github.com/hoan9an/ai-chat-multiplexer/releases/latest>
- Current app version: `0.1.10`

Windows 用户可从 release 页面安装 `.exe`/`.msi` artifact。Microsoft Edge WebView2 Runtime 是必需项，Windows 10/11 通常已经预装。

### 从源码运行

要求：

- Node.js 20+
- npm
- Rust stable
- Tauri 支持的桌面环境
- Windows：Visual Studio 2022 Build Tools with C++ workload 和 Rust MSVC toolchain

```bash
npm install
npm run tauri dev
```

构建 desktop app：

```bash
npm run tauri build
```

也可以运行 web-only development，但许多 AI 网站会主动阻止 iframe。真实测试请使用 desktop mode。

```bash
npm run dev
```

---

## 简洁技术栈

| Layer | Technology |
|---|---|
| Desktop runtime | Tauri 2 |
| Frontend | React 19 + TypeScript + Vite 7 |
| Native backend | Rust |
| State storage | `localStorage` |
| Session isolation | Tauri webview `data_directory` per profile |
| Styling | Plain CSS |
| Tests | Vitest + Testing Library + jsdom |

---

## Development

常用命令：

```bash
npm install
npm run dev
npm run tauri dev
npm run build
npm run tauri build
npm test
```

Linux/WSL build 需要 Tauri native dependencies，例如 `libwebkit2gtk-4.1-dev`、`libgtk-3-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`patchelf`、`build-essential` 和 `libssl-dev`。

修改 native webview、session、downloads、backup/restore 或 updater 相关功能时，请 smoke-test desktop app，不要只依赖 web dev mode。

---

## 版本

Current app version: `0.1.10`

---

## 作者

Made by **An** with AI-assisted development.

---

## License

MIT — see [LICENSE](./LICENSE).
