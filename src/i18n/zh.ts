import type { Dictionary } from "./vi";

export const zh: Dictionary = {
  // Shared / generic
  "common.close": "关闭",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.ok": "确定",
  "common.delete": "删除",
  "common.notice": "提示",

  // Provider popup policy
  "popup.blockedTitle": "弹出窗口已阻止",
  "popup.blankBlocked":
    "此页面先请求空白弹窗再跳转。应用无法安全地把此流程转换为标签页。",
  "popup.schemeBlocked":
    "应用只会把 HTTP/HTTPS 弹窗转换为标签页。请求的协议不受支持。",

  // Settings modal
  "settings.title": "设置",
  "settings.appearance": "外观",
  "settings.mode": "模式",
  "settings.light": "浅色",
  "settings.dark": "深色",
  "settings.language": "语言",
  "settings.langVietnamese": "Tiếng Việt",
  "settings.langEnglish": "English",
  "settings.langChinese": "中文",
  "settings.updates": "更新",
  "settings.currentVersion": "当前版本",
  "settings.backupRestore": "备份与恢复",

  // Diagnostics
  "diagnostics.title": "诊断与支持",
  "diagnostics.help":
    "支持包只包含版本、环境和已脱敏的事件代码。文件仅保存在本地，不会自动上传。",
  "diagnostics.export": "导出支持包",
  "diagnostics.exportTitle": "检查支持包",
  "diagnostics.exportPreview":
    "支持包包含 {count} 个事件，以及应用版本、Windows/架构和 WebView2。它不包含 Cookie、令牌、提示词、聊天内容、完整 URL、完整路径或会话文件。保存位置和是否分享均由您决定。",
  "diagnostics.saveTitle": "保存支持包",
  "diagnostics.exportFailedTitle": "无法导出支持包",
  "diagnostics.exportFailed": "无法保存诊断文件。错误事件代码已记录在本地。",

  // First run and support
  "onboarding.firstRun": "首次设置",
  "onboarding.title": "从工作流程开始",
  "onboarding.dismiss": "关闭引导",
  "onboarding.checkChoose": "为当前任务选择一个模板",
  "onboarding.checkSignIn": "在各 AI 服务中直接登录",
  "onboarding.checkRun": "执行相同任务并比较结果",
  "onboarding.compareThree": "比较 3 个 AI",
  "onboarding.compareThreeDescription":
    "在三个窗格中打开 ChatGPT、Claude 和 Gemini。",
  "onboarding.codingReview": "代码审查",
  "onboarding.codingReviewDescription": "在两个窗格中打开 Claude 和 ChatGPT。",
  "onboarding.research": "研究",
  "onboarding.researchDescription":
    "在三个窗格中打开 Perplexity、Gemini 和 ChatGPT。",
  "onboarding.skip": "跳过",
  "onboarding.showAgain": "再次显示引导",
  "support.reportIssue": "报告问题",
  "support.knownIssues": "已知问题",
  "support.privacyTitle": "报告前检查数据",
  "support.privacyMessage":
    "GitHub 将在外部浏览器中打开。仅在检查后附加支持包。请勿发送完整备份、配置文件目录、Cookie、令牌、提示词、聊天内容、完整 URL 或完整路径。",
  "support.continue": "打开问题表单",

  // Updates
  "update.check": "检查更新",
  "update.checking": "正在检查…",
  "update.current": "暂无新更新，或您已是最新版本。",
  "update.availablePrefix": "有新版本：",
  "update.openDownload": "打开下载页",
  "update.downloadInstall": "下载并安装",
  "update.downloading": "正在下载…",
  "update.installing": "正在安装…",
  "update.restarting": "正在重启…",
  "update.parseError": "无法读取最新版本。",

  // Backup & restore
  "backup.configWord": "配置",
  "backup.helpMiddle": "保存布局和配置文件。",
  "backup.fullBackupWord": "完整备份",
  "backup.helpEnd": "保存在本机上的会话。",
  "backup.exportConfig": "导出配置 (.json)",
  "backup.importConfig": "导入配置",
  "backup.fullBackup": "加密完整备份 (.acmbak)",
  "backup.restoreBackup": "从备份恢复",
  "backup.desktopOnly": "仅在桌面应用中可用",
  "backup.saveConfigTitle": "保存配置",
  "backup.fsUnavailable": "文件系统插件不可用",
  "backup.chooseConfigTitle": "选择配置文件",
  "backup.exportError": "导出失败：{msg}",
  "backup.importError": "导入失败：{msg}",
  "backup.invalidConfig": "文件不是有效的配置",
  "backup.configTooLarge": "配置文件超过 10 MiB 限制。",
  "backup.replaceConfigTitle": "替换当前配置？",
  "backup.replaceConfigMsg": "当前所有工作区和配置文件将被文件内容替换。",
  "backup.replace": "替换",
  "backup.fullDesktopOnly": "完整备份仅在桌面应用中可用。",
  "backup.saveFullTitle": "保存完整备份",
  "backup.backupScheduledTitle": "加密备份已完成",
  "backup.backupScheduledMsg":
    "加密文件已保存到：\n• {path}\n\n为创建一致的备份，会话窗格已关闭。是否立即重启应用？换电脑或 Windows 用户时，部分账号可能需要重新登录。",
  "backup.startupBackupSuccess":
    "备份完成：\n• {zip}\n• {config}\n\n使用 ZIP 恢复；保留 JSON 用于兼容。不要分享这些文件。",
  "backup.startupBackupZipOnly":
    "自包含备份 ZIP 已完成：\n• {zip}\n\n此 ZIP 可用于恢复。兼容性 JSON 边车文件未创建；请勿分享该 ZIP。",
  "backup.startupBackupError": "重启后备份失败：{msg}",
  "backup.startupRestoreSuccess":
    "恢复完成。应用状态和配置文件会话文件已应用。换电脑或 Windows 用户时，部分账号可能需要重新登录。",
  "backup.startupRestorePartial":
    "配置文件会话文件已恢复，但工作区/配置文件映射未恢复。部分标签页可能会使用当前布局/配置文件。",
  "backup.startupRestoreConfigError":
    "配置文件会话文件已恢复，但无法应用备份中的应用状态：{msg}",
  "backup.startupRestoreError": "重启后恢复失败：{msg}",
  "backup.backupComplete":
    "备份完成：\n• {zip}\n• {config}\n\n使用 ZIP 恢复；保留 JSON 用于兼容。不要分享这些文件。",
  "backup.backupError": "备份失败：{msg}",
  "backup.restoreDesktopOnly": "完整恢复仅在桌面应用中可用。",
  "backup.chooseRestoreTitle": "选择 .acmbak 或旧版 .zip 备份",
  "backup.restoreTitle": "恢复完整备份？",
  "backup.restoreMsg":
    "当前配置文件会话文件可能会被替换。换电脑或 Windows 用户时，部分账号可能需要重新登录。应用需要重启才能完全生效。",
  "backup.restore": "恢复",
  "backup.restoreDone": "已暂存恢复。请关闭并重新打开应用以应用恢复。",
  "backup.restoreSuccessTitle": "恢复成功",
  "backup.restoreSuccessMsg":
    "配置文件会话文件已暂存。立即重启应用以应用完整恢复？",
  "backup.restartNow": "立即重启",
  "backup.restartManual": "无法自动重启。请手动关闭并重新打开应用。",
  "backup.restoreError": "恢复失败：{msg}",
  "backup.unencryptedConsent": "新的完整备份始终使用密码加密。",
  "backup.encryptedNotice": "备份已加密；应用不会保存密码。",
  "backup.passwordExportTitle": "创建加密完整备份",
  "backup.passwordRestoreTitle": "打开完整备份",
  "backup.passwordExportHelp":
    "为此备份设置专用密码。若忘记密码，文件将无法恢复。",
  "backup.passwordRestoreHelp":
    "请输入 .acmbak 文件的密码。仅恢复旧版 ZIP 时可留空。重启后，恢复将替换当前会话。",
  "backup.passwordLabel": "备份密码",
  "backup.passwordConfirmLabel": "确认密码",
  "backup.passwordRequired": "请输入备份密码。",
  "backup.passwordMismatch": "两次输入的密码不一致。",
  "backup.createEncrypted": "创建加密备份",
  "backup.exporting": "正在创建备份…",
  "backup.restoreAuthError": "无法打开备份。密码错误，或文件已被修改/损坏。",
  "backup.restoring": "正在恢复…",
  "backup.cancelRestore": "取消恢复",
  "backup.restoreCancelError": "无法取消恢复：{msg}",

  // Pane
  "pane.tabsOf": "{title} 的标签页",
  "pane.closeTab": "关闭 {title}",
  "pane.splitControls": "分屏聊天控制",
  "pane.addTab": "添加标签页",
  "pane.minimizePane": "缩小窗格",
  "pane.maximizePane": "放大窗格",
  "pane.minimize": "缩小",
  "pane.maximize": "放大",
  "pane.closeSplit": "关闭分屏聊天",
  "pane.webNav": "网页导航",
  "pane.back": "后退",
  "pane.forward": "前进",
  "pane.reload": "重新加载",
  "pane.profileTitle": "配置文件：{name}",
  "pane.url": "网址",
  "pane.loading": "Loading",
  "pane.ready": "Ready",
  "pane.webPreview": "Web Preview",
  "pane.previewNotice":
    "该网页无法在预览中显示。在桌面应用（Tauri）中，内容将完整显示。",
  "pane.openInBrowser": "在浏览器中打开",

  // Downloads panel
  "downloads.title": "下载",
  "downloads.clearListTitle": "清空列表",
  "downloads.clearAll": "全部清除",
  "downloads.empty": "暂无已下载的文件。",
  "downloads.downloading": "正在下载…",
  "downloads.completed": "已完成",
  "downloads.error": "错误",
  "downloads.cancelled": "已取消",
  "downloads.openFile": "打开文件",
  "downloads.openFolder": "打开文件夹",

  // Download toasts
  "toast.downloading": "正在下载…",
  "toast.success": "下载完成",
  "toast.error": "下载失败",

  // App header
  "header.layoutControls": "布局控制",
  "header.chooseLayout": "选择布局",
  "header.layoutColumns": "使用 {label} 列布局",
  "header.focus": "Focus",
  "header.newPane": "新建窗格",
  "header.chooseProfile": "为新窗格选择配置文件",
  "header.renameProfile": "重命名 {name}",
  "header.rename": "重命名",
  "header.deleteProfile": "删除 {name}",
  "header.deleteProfileTitle": "删除配置文件",
  "header.newProfile": "新建配置文件…",
  "header.newProfileTitle": "新建配置文件",
  "header.newProfilePlaceholder": "例如：Work、Personal",
  "header.openSettings": "打开设置",
  "header.settings": "设置",
  "header.brand": "AI MULTIPLEXER",

  // Profile actions (dialogs)
  "profile.renameTitle": "重命名配置文件",
  "profile.newNamePlaceholder": "新名称",
  "profile.inUseTitle": "配置文件正在使用中",
  "profile.inUseMessage":
    "该配置文件正在被一个打开的窗格使用。请先关闭该窗格再删除。",
  "profile.deleteTitle": '删除配置文件 "{name}"？',
  "profile.deleteMessage": "该配置文件的所有 Cookie 和登录信息将被永久删除。",

  // Workspace switcher
  "workspace.choose": "选择工作区",
  "workspace.list": "工作区列表",
  "workspace.newWorkspace": "新建工作区",
  "workspace.renameCurrent": "重命名工作区",
  "workspace.deleteCurrent": "删除工作区",
  "workspace.paneCount": "{count} 个窗格",
  "workspace.renameTitle": "重命名工作区",
  "workspace.deleteTitle": '删除工作区 "{name}"？',
  "workspace.deleteMessage": "其中的所有窗格都将关闭。配置文件和会话将被保留。",
};
