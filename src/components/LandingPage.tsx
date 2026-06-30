import { useEffect } from "react";
import { AppLogo } from "../Icons";
import { APP_VERSION, GITHUB_REPO } from "../appCore";
import { useTranslation, type Lang } from "../i18n";
import heroImage from "../assets/ai-multiplexer-hero.png";

const releaseUrl = `https://github.com/${GITHUB_REPO}/releases/latest`;
const sourceUrl = `https://github.com/${GITHUB_REPO}`;

const aiServices = ["Claude", "ChatGPT", "Gemini", "Perplexity", "DeepSeek", "Grok"];
const languages: { value: Lang; label: string }[] = [
  { value: "vi", label: "VI" },
  { value: "en", label: "EN" },
  { value: "zh", label: "中文" },
];

type LandingCopy = {
  homeLabel: string;
  navLabel: string;
  nav: { features: string; workflow: string; download: string };
  navCta: string;
  kicker: string;
  headline: string;
  lede: string;
  primaryCta: string;
  secondaryCta: string;
  servicesLabel: string;
  previewLabel: string;
  previewAlt: string;
  windowLabel: string;
  highlightsLabel: string;
  highlights: { title: string; text: string }[];
  features: {
    eyebrow: string;
    title: string;
    text: string;
  }[];
  featureSection: { eyebrow: string; title: string; text: string };
  workflowSection: { eyebrow: string; title: string; text: string; items: string[] };
  privacy: { eyebrow: string; title: string; text: string };
  maintenance: { eyebrow: string; title: string; text: string };
  download: { versionLabel: string; title: string; text: string; cta: string };
};

const copy: Record<Lang, LandingCopy> = {
  vi: {
    homeLabel: "Trang chủ AI Chat Multiplexer",
    navLabel: "Điều hướng landing page",
    nav: { features: "Tính năng", workflow: "Workflow", download: "Tải về" },
    navCta: `Tải v${APP_VERSION}`,
    kicker: "AI workspace desktop local-first",
    headline: "Vận hành mọi cuộc trò chuyện AI như một phòng điều phối.",
    lede:
      "Claude, ChatGPT, Gemini, Perplexity, công cụ local và URL tùy ý trong một desktop grid tập trung — kèm profile tách biệt cho từng tài khoản.",
    primaryCta: "Tải bản mới nhất",
    secondaryCta: "Xem mã nguồn",
    servicesLabel: "Các dịch vụ AI hỗ trợ",
    previewLabel: "Ảnh xem trước AI Chat Multiplexer",
    previewAlt: "Workspace desktop AI Chat Multiplexer với bốn pane AI",
    windowLabel: "Workspace 2 · 4 pane",
    highlightsLabel: "Điểm nổi bật sản phẩm",
    highlights: [
      { title: "Tập trung 4 hướng", text: "Layout pane cho tư duy song song" },
      { title: "Session thật", text: "Thư mục profile riêng cho từng tài khoản" },
      { title: "Cập nhật đã ký", text: "Updater dựa trên GitHub release" },
    ],
    featureSection: {
      eyebrow: "Khác biệt ở đâu",
      title: "Ít loạn tab hơn. Nhiều luồng AI song song hơn.",
      text: "AI Chat Multiplexer giữ phần quan trọng trước mắt và đẩy sự lộn xộn của trình duyệt ra ngoài workflow.",
    },
    features: [
      {
        eyebrow: "01",
        title: "Nhiều phòng AI, một desktop",
        text: "Chia workspace thành các pane tập trung, giữ nhiều tab trong mỗi pane và không mất context giữa các cửa sổ trình duyệt.",
      },
      {
        eyebrow: "02",
        title: "Profile kiểu Chrome",
        text: "Tách Work, Personal, research và tài khoản khách hàng bằng cookie, storage và session directory riêng.",
      },
      {
        eyebrow: "03",
        title: "Native webview, không phải iframe",
        text: "Các dịch vụ AI hiện đại chặn embed vẫn chạy trong Tauri child webview thật với hành vi như trình duyệt bình thường.",
      },
      {
        eyebrow: "04",
        title: "Backup, restore, update",
        text: "Xuất cấu hình, tạo full backup, restore trạng thái app và cài bản cập nhật đã ký từ GitHub release.",
      },
    ],
    workflowSection: {
      eyebrow: "Dành cho người vận hành AI",
      title: "Workflow bình tĩnh hơn cho công việc đa model.",
      text: "Mở đúng tài khoản, đặt từng model vào đúng vị trí, rồi giữ cả dự án trong một bề mặt desktop duy nhất.",
      items: [
        "So sánh câu trả lời từ nhiều model cạnh nhau.",
        "Để một AI viết trong khi AI khác nghiên cứu.",
        "Tách danh tính cá nhân và công việc mà không rối trình duyệt.",
        "Giữ các chat chạy lâu trong pane riêng và tiếp tục làm việc.",
      ],
    },
    privacy: {
      eyebrow: "Quyền riêng tư",
      title: "Local-first theo mặc định.",
      text:
        "Trạng thái app nằm trên máy của bạn. Session profile nằm trong các thư mục local tách biệt. Full backup có thể chứa cookie và session file, nên hãy coi đó là dữ liệu riêng tư. Một số provider vẫn có thể yêu cầu đăng nhập lại sau restore vì cơ chế bảo mật của họ quyết định dữ liệu nào được dùng lại.",
    },
    maintenance: {
      eyebrow: "Bảo trì",
      title: "Backup và cập nhật có sẵn.",
      text:
        "Xuất cấu hình, restore trạng thái app khi có thể, và cài các bản phát hành đã ký bằng updater trong desktop app khi có phiên bản mới.",
    },
    download: {
      versionLabel: "Phiên bản hiện tại",
      title: "Sẵn sàng thay thế đống tab AI chưa?",
      text: "Tải bản desktop mới nhất, mở vài pane và biến workflow AI thành một command center tập trung.",
      cta: "Tải AI Chat Multiplexer",
    },
  },
  en: {
    homeLabel: "AI Chat Multiplexer home",
    navLabel: "Landing page navigation",
    nav: { features: "Features", workflow: "Workflow", download: "Download" },
    navCta: `Get v${APP_VERSION}`,
    kicker: "Local-first desktop AI workspace",
    headline: "Run every AI conversation like an operations room.",
    lede:
      "Claude, ChatGPT, Gemini, Perplexity, local tools, and custom URLs in one focused desktop grid — with isolated profiles for every account.",
    primaryCta: "Download latest release",
    secondaryCta: "View source",
    servicesLabel: "Supported AI services",
    previewLabel: "AI Chat Multiplexer app preview",
    previewAlt: "AI Chat Multiplexer desktop workspace with four AI panes",
    windowLabel: "Workspace 2 · 4 panes",
    highlightsLabel: "Product highlights",
    highlights: [
      { title: "4-way focus", text: "Pane layouts for parallel thinking" },
      { title: "Real sessions", text: "Profile directories per account" },
      { title: "Signed updates", text: "GitHub release powered updater" },
    ],
    featureSection: {
      eyebrow: "Why it feels different",
      title: "Less tab juggling. More parallel AI work.",
      text: "AI Chat Multiplexer keeps the powerful parts visible and pushes browser clutter out of the way.",
    },
    features: [
      {
        eyebrow: "01",
        title: "Many AI rooms, one desktop",
        text: "Split your workspace into focused panes, keep multiple tabs per pane, and stop losing context across browser windows.",
      },
      {
        eyebrow: "02",
        title: "Chrome-style profiles",
        text: "Separate Work, Personal, research, and client accounts with isolated cookies, storage, and session directories.",
      },
      {
        eyebrow: "03",
        title: "Native webviews, not iframes",
        text: "Modern AI services that block embeds can still run in real Tauri child webviews with normal browser behavior.",
      },
      {
        eyebrow: "04",
        title: "Backup, restore, update",
        text: "Export configuration, create full backups, restore app state, and install signed updates from GitHub releases.",
      },
    ],
    workflowSection: {
      eyebrow: "Designed for AI operators",
      title: "A calmer workflow for multi-model work.",
      text: "Open the right accounts, place each model where it belongs, then keep the whole project in one desktop surface.",
      items: [
        "Compare answers from several models side by side.",
        "Keep one AI writing while another researches.",
        "Separate personal and work identities without browser chaos.",
        "Park long-running chats in their own panes and keep moving.",
      ],
    },
    privacy: {
      eyebrow: "Privacy posture",
      title: "Local-first by default.",
      text:
        "App state stays on your machine. Profile sessions live in separate local directories. Full backups can include cookies and session files, so treat them as private data. Some providers may still ask you to sign in again after restore because their security controls decide what can be reused.",
    },
    maintenance: {
      eyebrow: "Maintenance",
      title: "Backup and updates are built in.",
      text:
        "Export configuration, restore full app state when possible, and install signed releases through the desktop updater when a newer version is available.",
    },
    download: {
      versionLabel: "Current app version",
      title: "Ready to replace your AI tab pile?",
      text: "Download the latest desktop build, open a few panes, and turn your AI workflow into a focused command center.",
      cta: "Download AI Chat Multiplexer",
    },
  },
  zh: {
    homeLabel: "AI Chat Multiplexer 首页",
    navLabel: "落地页导航",
    nav: { features: "功能", workflow: "工作流", download: "下载" },
    navCta: `获取 v${APP_VERSION}`,
    kicker: "本地优先的桌面 AI 工作区",
    headline: "像指挥室一样管理每一次 AI 对话。",
    lede:
      "Claude、ChatGPT、Gemini、Perplexity、本地工具和自定义 URL，都放进一个专注的桌面网格，并为每个账号隔离 profile。",
    primaryCta: "下载最新版",
    secondaryCta: "查看源码",
    servicesLabel: "支持的 AI 服务",
    previewLabel: "AI Chat Multiplexer 应用预览",
    previewAlt: "包含四个 AI 窗格的 AI Chat Multiplexer 桌面工作区",
    windowLabel: "Workspace 2 · 4 个窗格",
    highlightsLabel: "产品亮点",
    highlights: [
      { title: "四向专注", text: "为并行思考设计的窗格布局" },
      { title: "真实会话", text: "每个账号都有独立 profile 目录" },
      { title: "签名更新", text: "基于 GitHub release 的更新器" },
    ],
    featureSection: {
      eyebrow: "为什么不一样",
      title: "少一点标签页混乱，多一点并行 AI 工作。",
      text: "AI Chat Multiplexer 把关键内容留在眼前，把浏览器混乱移出工作流。",
    },
    features: [
      {
        eyebrow: "01",
        title: "多个 AI 房间，一个桌面",
        text: "把工作区拆成专注窗格，每个窗格保留多个标签页，不再在浏览器窗口之间丢失上下文。",
      },
      {
        eyebrow: "02",
        title: "Chrome 风格 profile",
        text: "用独立 cookie、storage 和 session 目录隔离工作、个人、研究和客户账号。",
      },
      {
        eyebrow: "03",
        title: "原生 webview，不是 iframe",
        text: "即使现代 AI 服务阻止嵌入，也可以在真实 Tauri 子 webview 中像普通浏览器一样运行。",
      },
      {
        eyebrow: "04",
        title: "备份、恢复、更新",
        text: "导出配置，创建完整备份，恢复应用状态，并从 GitHub release 安装已签名更新。",
      },
    ],
    workflowSection: {
      eyebrow: "为 AI 操作者设计",
      title: "让多模型工作流更安静、更清晰。",
      text: "打开正确账号，把每个模型放到合适位置，然后把整个项目留在同一个桌面界面中。",
      items: [
        "并排比较多个模型的回答。",
        "让一个 AI 写作，同时让另一个 AI 研究。",
        "隔离个人和工作身份，不再被浏览器搞乱。",
        "把长时间运行的聊天放在独立窗格中，继续推进其他任务。",
      ],
    },
    privacy: {
      eyebrow: "隐私姿态",
      title: "默认本地优先。",
      text:
        "应用状态保存在你的机器上。Profile 会话位于独立的本地目录中。完整备份可能包含 cookie 和会话文件，因此应视为私密数据。某些服务商在恢复后仍可能要求重新登录，因为它们的安全机制决定哪些数据可复用。",
    },
    maintenance: {
      eyebrow: "维护",
      title: "内置备份与更新。",
      text:
        "可导出配置，在可行时恢复完整应用状态，并在有新版本时通过桌面更新器安装已签名 release。",
    },
    download: {
      versionLabel: "当前版本",
      title: "准备好替代一堆 AI 标签页了吗？",
      text: "下载最新桌面版本，打开几个窗格，把你的 AI 工作流变成专注的指挥中心。",
      cta: "下载 AI Chat Multiplexer",
    },
  },
};

export function LandingPage() {
  const { lang, setLang } = useTranslation();
  const current = copy[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <main className="landing-page">
      <div className="landing-orb orb-one" aria-hidden="true" />
      <div className="landing-orb orb-two" aria-hidden="true" />

      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label={current.homeLabel}>
          <span className="landing-brand-mark">
            <AppLogo size={28} />
          </span>
          <span>AI Multiplexer</span>
        </a>
        <nav className="landing-links" aria-label={current.navLabel}>
          <a href="#features">{current.nav.features}</a>
          <a href="#workflow">{current.nav.workflow}</a>
          <a href="#download">{current.nav.download}</a>
        </nav>
        <div className="landing-nav-actions">
          <div className="landing-language-switcher" aria-label="Language selector">
            {languages.map((item) => (
              <button
                key={item.value}
                type="button"
                className={lang === item.value ? "active" : undefined}
                onClick={() => setLang(item.value)}
                aria-pressed={lang === item.value}
              >
                {item.label}
              </button>
            ))}
          </div>
          <a className="landing-nav-cta" href={releaseUrl} target="_blank" rel="noreferrer">
            {current.navCta}
          </a>
        </div>
      </header>

      <section id="top" className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-kicker">
            <span className="pulse-dot" aria-hidden="true" />
            {current.kicker}
          </div>
          <h1>{current.headline}</h1>
          <p className="landing-hero-lede">{current.lede}</p>
          <div className="landing-actions">
            <a className="landing-btn primary" href={releaseUrl} target="_blank" rel="noreferrer">
              {current.primaryCta}
            </a>
            <a className="landing-btn secondary" href={sourceUrl} target="_blank" rel="noreferrer">
              {current.secondaryCta}
            </a>
          </div>
          <div className="landing-service-strip" aria-label={current.servicesLabel}>
            {aiServices.map((service) => (
              <span key={service}>{service}</span>
            ))}
          </div>
        </div>

        <div className="landing-hero-visual" aria-label={current.previewLabel}>
          <div className="hero-window-bar">
            <span />
            <span />
            <span />
            <strong>{current.windowLabel}</strong>
          </div>
          <img src={heroImage} alt={current.previewAlt} />
        </div>
      </section>

      <section className="landing-trust-panel" aria-label={current.highlightsLabel}>
        {current.highlights.map((item) => (
          <div key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </div>
        ))}
      </section>

      <section id="features" className="landing-section">
        <div className="section-heading">
          <span>{current.featureSection.eyebrow}</span>
          <h2>{current.featureSection.title}</h2>
          <p>{current.featureSection.text}</p>
        </div>
        <div className="feature-grid">
          {current.features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span>{feature.eyebrow}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="landing-section split-section">
        <div className="section-heading align-left">
          <span>{current.workflowSection.eyebrow}</span>
          <h2>{current.workflowSection.title}</h2>
          <p>{current.workflowSection.text}</p>
        </div>
        <div className="workflow-list">
          {current.workflowSection.items.map((item) => (
            <div className="workflow-item" key={item}>
              <span aria-hidden="true">✦</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section security-section">
        <div className="security-card">
          <span>{current.privacy.eyebrow}</span>
          <h2>{current.privacy.title}</h2>
          <p>{current.privacy.text}</p>
        </div>
        <div className="security-card muted-card">
          <span>{current.maintenance.eyebrow}</span>
          <h2>{current.maintenance.title}</h2>
          <p>{current.maintenance.text}</p>
        </div>
      </section>

      <section id="download" className="landing-download">
        <div>
          <span>
            {current.download.versionLabel}: {APP_VERSION}
          </span>
          <h2>{current.download.title}</h2>
          <p>{current.download.text}</p>
        </div>
        <a className="landing-btn primary large" href={releaseUrl} target="_blank" rel="noreferrer">
          {current.download.cta}
        </a>
      </section>
    </main>
  );
}
