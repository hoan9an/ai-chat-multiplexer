// Vietnamese dictionary — the default language and the source of truth for keys.
// `en.ts` and `zh.ts` are typed against `Dictionary` so TypeScript enforces that
// all three dictionaries expose exactly the same set of keys.
//
// Interpolation: placeholders like {msg} / {name} are replaced by `t(key, params)`.

export const vi = {
  // Shared / generic
  "common.close": "Đóng",
  "common.cancel": "Hủy",
  "common.save": "Lưu",
  "common.ok": "OK",
  "common.delete": "Xóa",
  "common.notice": "Thông báo",

  // Provider popup policy
  "popup.blockedTitle": "Popup đã bị chặn",
  "popup.blankBlocked":
    "Trang này yêu cầu một popup trống rồi mới điều hướng. App không thể chuyển flow này thành tab một cách an toàn.",
  "popup.schemeBlocked":
    "App chỉ chuyển popup HTTP/HTTPS thành tab. Scheme mà trang yêu cầu không được hỗ trợ.",

  // Settings modal
  "settings.title": "Settings",
  "settings.appearance": "Giao diện",
  "settings.mode": "Chế độ",
  "settings.light": "Sáng",
  "settings.dark": "Tối",
  "settings.language": "Ngôn ngữ",
  "settings.langVietnamese": "Tiếng Việt",
  "settings.langEnglish": "English",
  "settings.langChinese": "中文",
  "settings.updates": "Cập nhật",
  "settings.currentVersion": "Phiên bản hiện tại",
  "settings.backupRestore": "Backup & khôi phục",

  // Diagnostics
  "diagnostics.title": "Chẩn đoán & hỗ trợ",
  "diagnostics.help":
    "Bundle chỉ chứa phiên bản, môi trường và mã sự kiện đã lược bỏ dữ liệu nhạy cảm. File được lưu cục bộ và không tự upload.",
  "diagnostics.export": "Xuất support bundle",
  "diagnostics.exportTitle": "Kiểm tra support bundle",
  "diagnostics.exportPreview":
    "Bundle có {count} sự kiện cùng phiên bản app, Windows/kiến trúc và WebView2. Không gồm cookie, token, prompt, nội dung chat, full URL, đường dẫn đầy đủ hoặc file session. Bạn tự quyết định nơi lưu và có gửi file hay không.",
  "diagnostics.saveTitle": "Lưu support bundle",
  "diagnostics.exportFailedTitle": "Không thể xuất support bundle",
  "diagnostics.exportFailed":
    "Không thể lưu file chẩn đoán. Mã lỗi đã được ghi cục bộ.",

  // First run and support
  "onboarding.firstRun": "Thiết lập lần đầu",
  "onboarding.title": "Bắt đầu với một workflow",
  "onboarding.dismiss": "Đóng hướng dẫn",
  "onboarding.checkChoose": "Chọn một template phù hợp với công việc",
  "onboarding.checkSignIn": "Đăng nhập trực tiếp trên từng dịch vụ AI",
  "onboarding.checkRun": "Thực hiện cùng một task và so sánh kết quả",
  "onboarding.compareThree": "So sánh 3 AI",
  "onboarding.compareThreeDescription":
    "ChatGPT, Claude và Gemini trong ba pane.",
  "onboarding.codingReview": "Review code",
  "onboarding.codingReviewDescription": "Claude và ChatGPT trong hai pane.",
  "onboarding.research": "Nghiên cứu",
  "onboarding.researchDescription":
    "Perplexity, Gemini và ChatGPT trong ba pane.",
  "onboarding.skip": "Bỏ qua",
  "onboarding.showAgain": "Mở lại hướng dẫn",
  "support.reportIssue": "Báo lỗi",
  "support.knownIssues": "Các lỗi đã biết",
  "support.privacyTitle": "Kiểm tra dữ liệu trước khi báo lỗi",
  "support.privacyMessage":
    "GitHub sẽ mở ở trình duyệt ngoài. Chỉ đính kèm support bundle sau khi đã tự kiểm tra. Không gửi full backup, thư mục profile, cookie, token, prompt, nội dung chat, URL đầy đủ hoặc đường dẫn đầy đủ.",
  "support.continue": "Mở form báo lỗi",

  // Updates
  "update.check": "Kiểm tra cập nhật",
  "update.checking": "Đang kiểm tra…",
  "update.current":
    "Chưa có bản cập nhật mới hoặc bạn đã ở phiên bản mới nhất.",
  "update.availablePrefix": "Có bản mới: ",
  "update.openDownload": "Mở trang tải",
  "update.downloadInstall": "Tải & cài đặt",
  "update.downloading": "Đang tải…",
  "update.installing": "Đang cài đặt…",
  "update.restarting": "Đang khởi động lại…",
  "update.parseError": "Không đọc được phiên bản mới.",

  // Backup & restore
  "backup.configWord": "Cấu hình",
  "backup.helpMiddle": " lưu bố cục và profile. ",
  "backup.fullBackupWord": "Full backup",
  "backup.helpEnd": " lưu phiên trên thiết bị này.",
  "backup.exportConfig": "Xuất cấu hình (.json)",
  "backup.importConfig": "Nhập cấu hình",
  "backup.fullBackup": "Full backup mã hóa (.acmbak)",
  "backup.restoreBackup": "Khôi phục từ backup",
  "backup.desktopOnly": "Chỉ chạy trong app desktop",
  "backup.saveConfigTitle": "Lưu cấu hình",
  "backup.fsUnavailable": "File system plugin không khả dụng",
  "backup.chooseConfigTitle": "Chọn file cấu hình",
  "backup.exportError": "Export lỗi: {msg}",
  "backup.importError": "Import lỗi: {msg}",
  "backup.invalidConfig": "File không phải config hợp lệ",
  "backup.configTooLarge": "File cấu hình vượt giới hạn 10 MiB.",
  "backup.replaceConfigTitle": "Thay thế cấu hình hiện tại?",
  "backup.replaceConfigMsg":
    "Tất cả workspace và profile hiện tại sẽ bị thay bằng nội dung từ file.",
  "backup.replace": "Thay thế",
  "backup.fullDesktopOnly": "Full backup chỉ chạy trong app desktop.",
  "backup.saveFullTitle": "Lưu full backup",
  "backup.backupScheduledTitle": "Backup mã hóa đã hoàn tất",
  "backup.backupScheduledMsg":
    "File đã được mã hóa và lưu tại:\n• {path}\n\nCác pane phiên đã đóng để backup nhất quán. Restart app ngay để tiếp tục? Khi đổi máy hoặc Windows user, một số tài khoản có thể cần đăng nhập lại.",
  "backup.startupBackupSuccess":
    "Backup hoàn tất:\n• {zip}\n• {config}\n\nDùng file ZIP để restore; giữ file JSON để tương thích. Không chia sẻ các file này.",
  "backup.startupBackupZipOnly":
    "File ZIP backup tự chứa đã hoàn tất:\n• {zip}\n\nCó thể dùng ZIP này để restore. JSON sidecar tương thích không được tạo; không chia sẻ file ZIP.",
  "backup.startupBackupError": "Backup lỗi sau khi restart: {msg}",
  "backup.startupRestoreSuccess":
    "Restore hoàn tất. Trạng thái app và file session profile đã được áp dụng. Một số tài khoản có thể cần đăng nhập lại khi đổi máy hoặc Windows user.",
  "backup.startupRestorePartial":
    "File session profile đã được restore, nhưng mapping workspace/profile chưa được restore. Một số tab có thể dùng layout/profile hiện tại.",
  "backup.startupRestoreConfigError":
    "File session profile đã được restore, nhưng không áp dụng được trạng thái app trong backup: {msg}",
  "backup.startupRestoreError": "Restore lỗi sau khi restart: {msg}",
  "backup.backupComplete":
    "Backup hoàn tất:\n• {zip}\n• {config}\n\nDùng file ZIP để restore; giữ file JSON để tương thích. Không chia sẻ các file này.",
  "backup.backupError": "Backup lỗi: {msg}",
  "backup.restoreDesktopOnly": "Restore full chỉ chạy được trong app desktop.",
  "backup.chooseRestoreTitle": "Chọn file backup .acmbak hoặc .zip cũ",
  "backup.restoreTitle": "Restore full backup?",
  "backup.restoreMsg":
    "File session profile hiện tại có thể bị thay thế. Khi đổi máy hoặc Windows user, một số tài khoản có thể cần đăng nhập lại. App cần restart để áp dụng đầy đủ.",
  "backup.restore": "Restore",
  "backup.restoreDone": "Đã stage restore. Hãy đóng và mở lại app để áp dụng.",
  "backup.restoreSuccessTitle": "Restore thành công",
  "backup.restoreSuccessMsg":
    "File session profile đã được stage. Restart app ngay để áp dụng full restore?",
  "backup.restartNow": "Restart ngay",
  "backup.restartManual":
    "Không thể tự restart. Hãy đóng và mở lại app thủ công.",
  "backup.restoreError": "Restore lỗi: {msg}",
  "backup.unencryptedConsent":
    "Full backup mới luôn được mã hóa bằng mật khẩu.",
  "backup.encryptedNotice": "Backup được mã hóa, app không lưu mật khẩu.",
  "backup.passwordExportTitle": "Tạo full backup mã hóa",
  "backup.passwordRestoreTitle": "Mở full backup",
  "backup.passwordExportHelp":
    "Nhập mật khẩu riêng cho file backup. Nếu quên, file không thể khôi phục.",
  "backup.passwordRestoreHelp":
    "Nhập mật khẩu của file .acmbak. Có thể để trống khi khôi phục file ZIP cũ. Restore sẽ thay thế session hiện tại sau khi restart.",
  "backup.passwordLabel": "Mật khẩu backup",
  "backup.passwordConfirmLabel": "Nhập lại mật khẩu",
  "backup.passwordRequired": "Hãy nhập mật khẩu backup.",
  "backup.passwordMismatch": "Hai mật khẩu không khớp.",
  "backup.createEncrypted": "Tạo backup mã hóa",
  "backup.exporting": "Đang tạo backup…",
  "backup.restoreAuthError":
    "Không thể mở backup. Mật khẩu sai hoặc file đã bị thay đổi/hỏng.",
  "backup.restoring": "Đang restore…",
  "backup.cancelRestore": "Hủy restore",
  "backup.restoreCancelError": "Không thể hủy restore: {msg}",

  // Pane
  "pane.tabsOf": "Tab của {title}",
  "pane.closeTab": "Xóa {title}",
  "pane.splitControls": "Điều khiển split chat",
  "pane.addTab": "Thêm tab",
  "pane.minimizePane": "Thu nhỏ pane",
  "pane.maximizePane": "Phóng to pane",
  "pane.minimize": "Thu nhỏ",
  "pane.maximize": "Phóng to",
  "pane.closeSplit": "Đóng split chat",
  "pane.webNav": "Điều hướng web",
  "pane.back": "Lùi",
  "pane.forward": "Tiến",
  "pane.reload": "Tải lại",
  "pane.profileTitle": "Profile: {name}",
  "pane.url": "URL",
  "pane.loading": "Loading",
  "pane.ready": "Ready",
  "pane.webPreview": "Web Preview",
  "pane.previewNotice":
    "Trang web không hiển thị được trong bản xem trước. Trên app desktop (Tauri), nội dung sẽ hiển thị đầy đủ.",
  "pane.openInBrowser": "Mở bằng trình duyệt",
  "pane.resizeColumns": "Kéo để đổi độ rộng cột {index}",
  "pane.resizeRows": "Kéo để đổi độ cao hàng {index}",
  "pane.menu": "Tùy chọn pane",
  "pane.rename": "Đổi tên pane",
  "pane.renameTitle": "Đổi tên pane",
  "pane.newTitlePlaceholder": "Tên pane mới",
  "pane.split": "Thêm pane bên cạnh",
  "pane.duplicate": "Nhân đôi pane",
  "pane.copyUrl": "Copy URL",
  "pane.openExternal": "Mở ở trình duyệt ngoài",
  "pane.resetSizes": "Chia lại kích thước đều",
  "pane.moveToProfile": "Chuyển sang profile",

  // Downloads panel
  "downloads.title": "Tải xuống",
  "downloads.clearListTitle": "Xóa danh sách",
  "downloads.clearAll": "Xóa hết",
  "downloads.empty": "Chưa có file nào được tải.",
  "downloads.downloading": "Đang tải…",
  "downloads.completed": "Hoàn tất",
  "downloads.error": "Lỗi",
  "downloads.cancelled": "Đã hủy",
  "downloads.openFile": "Mở file",
  "downloads.openFolder": "Mở folder",

  // Download toasts
  "toast.downloading": "Đang tải…",
  "toast.success": "Đã tải xong",
  "toast.error": "Tải lỗi",

  // App header
  "header.layoutControls": "Điều khiển layout",
  "header.chooseLayout": "Chọn bố cục",
  "header.layoutColumns": "Dùng bố cục {label} cột",
  "header.focus": "Focus",
  "header.newPane": "New Pane",
  "header.chooseProfile": "Chọn profile cho pane mới",
  "header.renameProfile": "Đổi tên {name}",
  "header.rename": "Đổi tên",
  "header.deleteProfile": "Xóa {name}",
  "header.deleteProfileTitle": "Xóa profile",
  "header.newProfile": "New profile…",
  "header.newProfileTitle": "Profile mới",
  "header.newProfilePlaceholder": "vd: Work, Personal",
  "header.openSettings": "Mở cài đặt",
  "header.settings": "Cài đặt",
  "header.brand": "AI MULTIPLEXER",

  // Profile actions (dialogs)
  "profile.renameTitle": "Đổi tên profile",
  "profile.newNamePlaceholder": "Tên mới",
  "profile.inUseTitle": "Profile đang được dùng",
  "profile.inUseMessage":
    "Profile này đang được dùng bởi một pane đang mở. Đóng pane trước khi xóa.",
  "profile.deleteTitle": 'Xóa profile "{name}"?',
  "profile.deleteMessage":
    "Toàn bộ cookie và đăng nhập của profile này sẽ bị xóa vĩnh viễn.",

  // Workspace switcher
  "workspace.choose": "Chọn workspace",
  "workspace.list": "Danh sách workspace",
  "workspace.newWorkspace": "Workspace mới",
  "workspace.renameCurrent": "Đổi tên workspace",
  "workspace.deleteCurrent": "Xóa workspace",
  "workspace.paneCount": "{count} pane",
  "workspace.renameTitle": "Đổi tên workspace",
  "workspace.deleteTitle": 'Xóa workspace "{name}"?',
  "workspace.deleteMessage":
    "Tất cả pane bên trong sẽ bị đóng. Profile và session vẫn được giữ lại.",
};

export type TranslationKey = keyof typeof vi;
export type Dictionary = Record<TranslationKey, string>;
