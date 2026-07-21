# AI Chat Multiplexer

一个 local-first 桌面工作区，可并排运行多个 AI Web 应用，同时有序管理项目与浏览器会话。

[![最新版本](https://img.shields.io/github/v/release/hoan9an/ai-chat-multiplexer?display_name=tag&sort=semver)](https://github.com/hoan9an/ai-chat-multiplexer/releases/latest)
[![CI](https://github.com/hoan9an/ai-chat-multiplexer/actions/workflows/ci.yml/badge.svg)](https://github.com/hoan9an/ai-chat-multiplexer/actions/workflows/ci.yml)
[![许可证：MIT](https://img.shields.io/github/license/hoan9an/ai-chat-multiplexer)](./LICENSE)

语言：[English](./README.md) · [Tiếng Việt](./README.vi.md) · [中文](./README.zh.md)

![AI Chat Multiplexer 桌面工作区](./docs/assets/ai-multiplexer-hero.png)

[下载最新版本](https://github.com/hoan9an/ai-chat-multiplexer/releases/latest) · [已知问题](./docs/support/known-issues.md) · [从源码构建](#从源码构建)

## 为什么使用它？

AI 工作通常横跨多个模型、账号和项目。AI Chat Multiplexer 将这些工作流集中在一个桌面窗口中，同时避免把它们混入同一个浏览器会话。

| 需求 | 应用提供的能力 |
|---|---|
| 比较模型 | 在相邻 pane 中放置多个 AI 服务。 |
| 整理项目 | 在独立 workspace 中保存 pane 和 tab。 |
| 隔离账号 | 每个 profile 拥有独立的 cookie、storage、cache 和登录 session。 |
| 并行工作 | 让耗时任务继续运行，同时使用其他 pane。 |
| 打开禁止 iframe 的服务 | 使用 Tauri native child webview 而不是普通 iframe 渲染外部网站。 |

## 核心能力

- 各 workspace 拥有独立的 pane 布局和 tab 状态。
- Focus mode 与一至四列布局，并支持拖放调整 pane 顺序。
- Tab 可以重新排序、拆分成新 pane，或在使用相同 profile 的 pane 之间移动。
- 通过独立的 Tauri webview data directory 实现 profile 级浏览器 session 隔离。
- Native 下载、新窗口路由、更新检查，以及经过敏感信息删减的本地诊断。
- 可选 onboarding，以及用于模型比较、代码 review 和研究的预设 workflow。
- 英语、越南语和中文界面。

React 界面负责 workspace 模型和布局；Rust/Tauri 后端负责 native child webview、profile session 目录、下载、backup/restore 及其他桌面特权操作。外部 AI 服务仍负责各自的账号、内容与政策；应用不会代理服务商流量，也不会绕过其保护机制。

## Backup 与隐私

两种 backup 模式用途不同：

- **配置导出**仅保存 workspace、pane、tab 和 profile 定义。
- **Full backup v2**将应用状态 metadata 和 profile session 文件保存在使用口令（passphrase）加密的 archive 中。

应用不会保存 full backup 口令。请妥善保管；口令遗失后无法恢复。Full backup 可能包含 cookie 和其他敏感 session 数据，因此即使文件已经加密，也应将其视为私密数据。

应用仍可读取旧版未加密 v1 ZIP 用于迁移，但不会再创建该格式。Restore 属于 best-effort：迁移到另一台设备或另一个 Windows 用户后，受保护服务可能要求重新登录。

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| Windows 10/11 x64 | 支持的 Beta | 需要 Microsoft Edge WebView2 Evergreen；受支持的 Windows 版本通常已包含它。 |
| macOS | 实验性 | 可能提供用于评估的 artifact，但它还不是受支持的 Beta 平台。 |
| Linux | 实验性 | 桌面行为取决于发行版和 WebKitGTK 环境。 |

Windows 安装包可能尚未进行 Authenticode 签名，因此可能触发“未知发布者”警告。请查看[最新版本说明](https://github.com/hoan9an/ai-chat-multiplexer/releases/latest)，确认所下载构建的具体签名状态、artifact 和已知限制。

详细支持约定：[Windows](./docs/support/windows-support-contract.md) · [macOS](./docs/support/macos-support-contract.md) · [Linux](./docs/support/linux-support-contract.md)

## 下载并运行

1. 打开 [GitHub Releases](https://github.com/hoan9an/ai-chat-multiplexer/releases/latest)。
2. 阅读 release notes，然后选择适用于你的平台的 artifact。
3. 在 Windows 上安装 `.exe` 或 `.msi`，并在继续前检查所有发布者警告。
4. 为需要隔离的账号创建 profile，再把服务安排到 pane 和 workspace 中。

## 从源码构建

要求：

- Node.js 20+ 与 npm。
- Stable Rust，以及 [Tauri 桌面构建](https://v2.tauri.app/start/prerequisites/)所需的组件。
- Windows：带 C++ workload 的 Visual Studio 2022 Build Tools、Rust MSVC toolchain 和 WebView2。

```bash
npm install
npm run tauri dev
```

`npm run dev` 会启动 web-only shell。它适合界面开发，但无法验证 native webview、隔离的 profile session、下载、加密 backup/restore 或 updater 行为。

提交更改前运行主要本地检查：

```bash
npm run build
npm test
npm run test:release
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## 架构与仓库地图

```text
React app shell 与本地 workspace 状态
                │
                ▼
       typed Tauri commands/events
                │
                ▼
Rust backend ── native child webviews ── 外部 AI 服务
       │
       ├─ profile session 目录
       └─ 下载、backup/restore、诊断、updater
```

- [`src/`](./src/) — React/TypeScript 界面、状态、hooks 和翻译。
- [`src-tauri/`](./src-tauri/) — Rust 后端、Tauri 配置、权限和 bundle assets。
- [`landing/`](./landing/) — 独立静态产品页面，与桌面 runtime 分离。
- [`docs/`](./docs/) — 支持约定、已知问题、安全说明和发布流程。
- [`.github/workflows/`](./.github/workflows/) — CI 与发布自动化。

技术 baseline 见 [`docs/technical-baseline.md`](./docs/technical-baseline.md)。

## 发布与版本管理

本 README 有意不重复版本号。动态 badge 和 `releases/latest` URL 会始终把读者带到当前最新的已发布版本。

版本值维护在 `package.json`、`src/appCore.ts`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中。[`scripts/validate-version-lock.mjs`](./scripts/validate-version-lock.mjs) 会验证这些来源与 release tag 一致。维护中的流程见 [release gate runbook](./docs/release/release-gate-runbook.md)。

只有当产品行为、支持政策或 contributor workflow 改变时才应修改 README，而不应为常规版本号升级重复修改。

## 支持与贡献

- 报告问题前，请先查看[已知问题](./docs/support/known-issues.md)和 [Beta 支持政策](./docs/support/beta-support-policy.md)。
- 搜索或创建 [GitHub issue](https://github.com/hoan9an/ai-chat-multiplexer/issues)，提供可复现步骤和不含敏感数据的诊断信息。
- 保持更改范围集中，添加或更新相关测试；凡涉及 native 行为，都应 smoke-test 桌面应用。
- 不要在 issue 或 commit 中包含 cookie、token、私密 prompt、session 文件、签名密钥或 full backup。

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
