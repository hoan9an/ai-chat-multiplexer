# AI Chat Multiplexer

Trung tâm làm việc desktop local-first để so sánh, điều phối và giữ nhiều phiên chat AI chạy song song.

![Status](https://img.shields.io/badge/status-active-success) ![Version](https://img.shields.io/badge/version-0.1.10-blue) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![React](https://img.shields.io/badge/React-19-blue) ![License](https://img.shields.io/badge/license-MIT-green)

Ngôn ngữ: [English](./README.md) · [Tiếng Việt](./README.vi.md) · [中文](./README.zh.md)

---

## Một workspace. Mọi cuộc trò chuyện AI.

AI Chat Multiplexer biến desktop của bạn thành một phòng điều phối AI tập trung: Claude ở một pane, ChatGPT ở pane khác, Gemini cạnh công cụ nghiên cứu, còn tài khoản Work/Personal được tách biệt an toàn.

Không còn săn tab. Không còn đăng nhập qua lại. Không còn mất context khi một model vẫn đang suy nghĩ.

![Ảnh xem trước workspace desktop của AI Chat Multiplexer](./docs/assets/ai-multiplexer-hero.png)

<p align="center">
  <a href="https://github.com/hoan9an/ai-chat-multiplexer/releases/latest"><strong>Tải bản mới nhất</strong></a>
  ·
  <a href="https://github.com/hoan9an/ai-chat-multiplexer/releases/tag/v0.1.10">Xem v0.1.10</a>
  ·
  <a href="#quick-start">Chạy từ source</a>
</p>

---

## Dành cho cách làm việc của power user AI

Công việc với AI hiện đại hiếm khi chỉ là một khung chat. Bạn cần so sánh câu trả lời, chạy prompt song song, giữ context theo dự án và chuyển đổi giữa nhiều tài khoản. Trình duyệt làm được, nhưng tab rất nhanh trở nên rối và dễ đứt mạch.

AI Chat Multiplexer mang trải nghiệm kiểu terminal multiplexer vào workflow AI:

- hỏi nhiều model cùng một câu và so sánh phản hồi theo thời gian thực;
- đặt research, writing, coding và review chat cạnh nhau;
- tách tài khoản khách hàng, công việc, cá nhân và thử nghiệm bằng profile riêng;
- giữ các phiên quan trọng sau khi mở lại app;
- dùng được các website AI chặn iframe nhờ native Tauri webview.

---

## Điểm nổi bật

### Workspace AI nhiều pane

Chia một cửa sổ desktop thành các pane tập trung. Dùng focus mode, layout 2 cột, 3 cột hoặc 4 cột, rồi kéo thả pane theo đúng nhịp làm việc của bạn.

### Profile tách biệt kiểu Chrome

Profile là container session trình duyệt thật. Mỗi profile có cookie, storage, cache và login session riêng, nên tài khoản Work và Personal có thể đăng nhập cùng lúc mà không lẫn dữ liệu.

### Tab trong từng pane

Mỗi pane có thể chứa nhiều tab với URL, title, favicon và trạng thái loading riêng. Bạn có thể sắp xếp lại tab, chuyển tab giữa các pane cùng profile, hoặc tách tab thành pane mới.

### Native webview, không phải iframe mong manh

Nhiều dịch vụ AI chặn iframe bằng CSP hoặc `X-Frame-Options`. AI Chat Multiplexer dùng Tauri native child webview, nên các trang đó hoạt động như bề mặt trình duyệt desktop bình thường.

### Local-first

Workspace, pane, tab, profile, theme và layout được lưu cục bộ. App đóng vai trò desktop shell cho các dịch vụ bạn chọn, không phải proxy hosted cho nội dung chat của bạn.

### Backup và restore

Xuất/nhập cấu hình dạng JSON, hoặc tạo full backup ZIP có thể bao gồm workspace, pane, tab, mapping profile và file session profile. Full backup có thể chứa cookie/session nên cần coi như dữ liệu riêng tư. Restore session là best-effort; các trang được bảo vệ vẫn có thể yêu cầu đăng nhập lại khi đổi máy hoặc đổi Windows user.

### Sẵn sàng auto-update

Desktop app có thể kiểm tra GitHub release. Bản phát hành đã ký có thể được tải, cài đặt và relaunch qua Tauri updater; môi trường fallback sẽ mở trang release.

---

## Workflow thường dùng

| Workflow | AI Chat Multiplexer hỗ trợ như thế nào |
|---|---|
| So sánh model | Mở Claude, ChatGPT, Gemini và Perplexity cạnh nhau rồi hỏi cùng một câu. |
| Research + viết nháp | Giữ pane research luôn thấy được trong khi AI khác viết, chỉnh sửa hoặc tóm tắt. |
| Tách tài khoản | Dùng profile Work, Personal, Client hoặc Lab với session đăng nhập riêng. |
| Prompt chạy lâu | Để một model suy nghĩ trong khi bạn tiếp tục làm việc ở pane khác. |
| Context theo dự án | Tạo workspace riêng cho khách hàng, repo, chủ đề hoặc thử nghiệm. |
| Công cụ local | Mở app localhost, docs, dashboard hoặc công cụ AI local cạnh chat AI hosted. |

---

## Mô hình riêng tư và bảo mật

AI Chat Multiplexer được thiết kế local-first:

- website AI bên ngoài chạy trong native desktop webview;
- browser storage được tách theo profile bằng data directory riêng;
- trạng thái workspace được lưu cục bộ;
- full backup có thể bao gồm file session nhạy cảm và cần được bảo vệ tương ứng;
- restore session không giải mã, export hay vượt qua cookie, token, DPAPI, app-bound encryption hoặc cơ chế bảo vệ của website.

Vì đây là desktop app kiểu browser shell, chỉ nên dùng với dịch vụ tin cậy và tránh expose privileged Tauri commands cho web content không tin cậy.

---

## Quick start

### Tải app

Lấy installer mới nhất từ GitHub Releases:

- Latest release: <https://github.com/hoan9an/ai-chat-multiplexer/releases/latest>
- Current app version: `0.1.10`

Trên Windows, cài artifact `.exe`/`.msi` từ trang release. Microsoft Edge WebView2 Runtime là bắt buộc và thường đã có sẵn trên Windows 10/11.

### Chạy từ source

Yêu cầu:

- Node.js 20+
- npm
- Rust stable
- Desktop environment được Tauri hỗ trợ
- Windows: Visual Studio 2022 Build Tools với C++ workload và Rust MSVC toolchain

```bash
npm install
npm run tauri dev
```

Build desktop app:

```bash
npm run tauri build
```

Web-only development cũng có sẵn, nhưng nhiều website AI chủ động chặn iframe. Hãy dùng desktop mode để kiểm thử sát thực tế.

```bash
npm run dev
```

---

## Tech stack gọn

| Layer | Công nghệ |
|---|---|
| Desktop runtime | Tauri 2 |
| Frontend | React 19 + TypeScript + Vite 7 |
| Native backend | Rust |
| State storage | `localStorage` |
| Session isolation | Tauri webview `data_directory` theo từng profile |
| Styling | CSS thuần |
| Tests | Vitest + Testing Library + jsdom |

---

## Development

Các lệnh hữu ích:

```bash
npm install
npm run dev
npm run tauri dev
npm run build
npm run tauri build
npm test
```

Build trên Linux/WSL cần các dependency native của Tauri như `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, `build-essential` và `libssl-dev`.

Khi sửa native webview, session, download, backup/restore hoặc updater, hãy smoke-test desktop app thay vì chỉ dựa vào web dev mode.

---

## Phiên bản

Current app version: `0.1.10`

---

## Tác giả

Made by **An** with AI-assisted development.

---

## License

MIT — xem [LICENSE](./LICENSE).
