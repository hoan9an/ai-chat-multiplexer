# AI Chat Multiplexer

Không gian làm việc desktop để chạy nhiều phiên chat AI song song, kèm hệ thống profile tách biệt kiểu Chrome để dùng nhiều tài khoản cùng lúc.

![Status](https://img.shields.io/badge/status-active-success) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![React](https://img.shields.io/badge/React-19-blue) ![License](https://img.shields.io/badge/license-MIT-green)

Ngôn ngữ: [English](./README.md) · [Tiếng Việt](./README.vi.md) · [中文](./README.zh.md)

---

## Tổng quan

AI Chat Multiplexer là ứng dụng desktop local-first dành cho người thường xuyên làm việc với nhiều công cụ AI cùng lúc. Thay vì mở hàng chục tab trình duyệt, bạn có thể chia một cửa sổ thành nhiều pane và chạy Claude, ChatGPT, Gemini, Perplexity, DeepSeek, công cụ local hoặc bất kỳ URL nào cạnh nhau.

Ứng dụng dùng native Tauri webview thật thay vì iframe, nên các trang AI hiện đại chặn iframe vẫn có thể chạy bình thường trong desktop app.

---

## Vì sao có dự án này?

Khi làm việc với AI, bạn thường cần:

- hỏi nhiều model cùng một câu,
- để một AI viết trong khi AI khác nghiên cứu,
- so sánh tài khoản Work và Personal,
- chờ phản hồi dài rồi chuyển sang việc khác,
- giữ nhiều context theo từng dự án.

Tab trình duyệt bình thường rất nhanh bị rối. AI Chat Multiplexer mang cách làm việc kiểu terminal multiplexer vào workflow AI: nhiều pane, nhiều tab, profile riêng, một workspace tập trung.

---

## Tính năng chính

### Workspace

- Tạo nhiều workspace như `Work`, `Personal`, `Research` hoặc theo từng project.
- Mỗi workspace có layout pane riêng.
- Đổi tên/xóa workspace trong app.
- Trạng thái app được khôi phục khi mở lại.

### Layout linh hoạt

- Focus mode cho một pane.
- Layout 2 cột, 3 cột, 4 cột.
- Số cột tự động giới hạn theo số pane.
- Kéo thả để đổi vị trí pane.
- Phóng to một pane mà không mất workspace hiện tại.

### Profile kiểu Chrome

Profile là container session trình duyệt, không phải preset riêng cho từng AI provider.

- Mỗi profile có thư mục cookie/storage/session riêng.
- Có thể dùng `Work`, `Personal` hoặc tên bất kỳ.
- Nhiều pane dùng cùng profile sẽ dùng chung đăng nhập/session.
- Profile khác nhau sẽ tách biệt tài khoản.
- Đóng pane không xóa profile/session.
- Không thể xóa profile khi còn pane đang sử dụng.

### Tab trong pane

- Mỗi pane có nhiều tab.
- Mỗi tab có URL, title, favicon và trạng thái loading riêng.
- URL bar hỗ trợ URL trực tiếp, localhost và search query.
- Có back, forward, reload cho tab đang active.
- Kéo thả để sắp xếp tab.
- Di chuyển tab sang pane khác nếu cùng profile.
- Tách tab thành pane mới.

### Native webview engine

Nhiều website AI chặn iframe bằng `X-Frame-Options` hoặc CSP. AI Chat Multiplexer tránh vấn đề đó bằng Tauri native child webview.

Luồng hoạt động:

1. React render một `webview-shell` làm khung trống cho pane active.
2. React đo vị trí/kích thước khung đó.
3. Tauri tạo hoặc di chuyển native webview khớp với khung.
4. Webview dùng session directory của profile được chọn.
5. Khi menu, modal, download panel hoặc drag overlay mở, native webview được ẩn để không che UI React.

### Downloads

- Download trong native webview được xử lý bởi Rust/Tauri.
- App hiển thị toast download.
- Có thể mở file hoặc mở thư mục chứa file sau khi tải xong.
- Có workaround cho WebView2 trên Windows khi sự kiện download finished không ổn định.

### Backup và restore

- Xuất/nhập cấu hình app dạng JSON.
- Full backup có thể bao gồm session/cookie profile dạng ZIP.
- Restore session từ ZIP.

> **Lưu ý bảo mật:** full backup có thể chứa cookie/session đăng nhập. Hãy giữ riêng tư và không chia sẻ file này.

### Cập nhật

- App có thể kiểm tra GitHub release mới nhất.
- Nếu có phiên bản mới, app mở trang release.

---

## Công nghệ

| Layer | Công nghệ |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 |
| Desktop runtime | Tauri 2 |
| Native backend | Rust |
| State storage | `localStorage` |
| Browser session storage | Tauri webview `data_directory` theo từng profile |
| Styling | CSS thuần |
| Tests | Vitest + Testing Library + jsdom |
| Icons | Inline custom SVG components |

---

## Cấu trúc project

```text
.
├── src/
│   ├── App.tsx                         # Composition root
│   ├── appCore.ts                      # Types, constants, helpers, migrations
│   ├── newtab.ts                       # New-tab URL helpers
│   ├── main.tsx                        # React entrypoint
│   ├── App.css                         # Theme và layout styles
│   ├── Icons.tsx                       # Inline SVG icons
│   ├── components/                     # UI components
│   ├── hooks/                          # State/effects/actions hooks
│   └── types/
├── src-tauri/
│   ├── src/lib.rs                      # Tauri commands và native backend
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── tauri.conf.json
├── public/
├── scripts/
├── package.json
└── README.md
```

---

## Kiến trúc

### Data model

```text
AppState
├── workspaces[]
│   └── panes[]
│       └── tabs[]
└── profiles[]
```

Ý nghĩa:

- Workspace: không gian làm việc/layout riêng.
- Pane: một vùng browser/chat.
- Tab: nhiều trang/chat trong một pane.
- Profile: container cookie/session riêng.

### Ý nghĩa các URL field

App tách rõ URL do app chủ động load và URL quan sát được từ webview:

- `loadedUrl`: URL cuối cùng app chủ động yêu cầu native webview load.
- `currentUrl`: URL quan sát được từ native webview sau redirect hoặc SPA route change.
- Address bar hiển thị URL quan sát được, nhưng SPA route change không được feed ngược vào `load_url`, nếu không Gemini hoặc các SPA khác có thể reload và mất state trong trang.

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

Label native webview dựa trên tab ID để khi di chuyển tab, webview/session không bị hủy.

### Cô lập profile session

Mỗi profile ánh xạ tới thư mục session riêng:

```text
app_data_dir/pane-sessions/<profile_id>/
```

Cookie, localStorage, IndexedDB, cache và login session được tách biệt theo profile.

---

## Invariant quan trọng

Khi sửa app, cần giữ các luật sau:

1. Native webview label phải ổn định theo tab.
2. Profile ID phải map tới `data_directory` riêng.
3. Pane không được rỗng vĩnh viễn.
4. Workspace phải có fallback active hợp lệ.
5. Chỉ cho move tab cross-pane khi cùng profile.
6. Native webview phải ẩn khi menu/modal/download panel/drag overlay mở.
7. Polling status từ native webview không được tự gây reload.
8. Migration state phải giữ dữ liệu user.

---

## Yêu cầu hệ thống

### Chung

- Node.js 20+ khuyến nghị
- npm
- Rust stable
- Desktop environment được Tauri hỗ trợ

### Windows

- Windows 10/11
- Microsoft Edge WebView2 Runtime
- Visual Studio 2022 Build Tools với C++ workload
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

## Cài đặt và chạy

Cài dependencies:

```bash
npm install
```

Chạy web-only dev mode:

```bash
npm run dev
```

Chạy desktop dev mode:

```bash
npm run tauri dev
```

Build frontend:

```bash
npm run build
```

Build desktop app:

```bash
npm run tauri build
```

---

## Testing

Chạy toàn bộ test:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Vitest UI:

```bash
npm run test:ui
```

Test suite bao phủ state helpers, migrations, pane/tab behavior, native webview sync, backup/update, download manager và components.

---

## Manual desktop smoke test

1. Mở desktop app.
2. Mở hai pane cùng profile và xác nhận session được share.
3. Mở hai pane khác profile và xác nhận login tách biệt.
4. Mở Gemini, tạo chat mới, gõ một tin nhắn và xác nhận không bị flicker/reload mất conversation.
5. Mở Settings khi webview đang hiện và xác nhận modal không bị che.
6. Kéo pane và xác nhận webview ẩn/hiện đúng.
7. Kéo tab trong pane.
8. Kéo tab sang pane cùng profile.
9. Xác nhận tab khác profile không move được.
10. Tải file và kiểm tra toast/open/reveal.
11. Export config JSON.
12. Full backup/restore trong môi trường test.

---

## Build outputs

Tauri build artifacts nằm ở:

```text
src-tauri/target/release/bundle/
```

Trên Windows thường có:

```text
src-tauri/target/release/bundle/nsis/*.exe
src-tauri/target/release/bundle/msi/*.msi
```

---

## Bảo mật

- External websites chạy trong native webview.
- Profile tách browser storage bằng data directory riêng.
- Full backup có thể chứa cookie/session và phải coi như dữ liệu riêng tư.
- CSP trong Tauri config được tắt để hỗ trợ nhiều external sites; đây là tradeoff có chủ đích cho browser-shell app.
- Không expose privileged Tauri commands cho web content không tin cậy.

---

## Troubleshooting

### Website không render trong web dev mode

Đây là bình thường với nhiều AI sites vì iframe bị chặn. Hãy dùng desktop mode:

```bash
npm run tauri dev
```

### WSL báo Permission denied với npm binaries

```bash
chmod +x node_modules/.bin/vitest node_modules/.bin/tsc node_modules/.bin/vite node_modules/.bin/tauri
```

### Rollup optional dependency bị thiếu

```bash
npm install
```

### Linux build thiếu `dbus-1` hoặc `webkit2gtk-4.1`

Cài các package Linux/WSL ở phần yêu cầu hệ thống.

---

## Phiên bản

Current app version: `0.1.5`

---

## Tác giả

Made by **An** with AI-assisted development.

---

## License

MIT — xem [LICENSE](./LICENSE).
