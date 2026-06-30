import { AppLogo } from "../Icons";
import { APP_VERSION, GITHUB_REPO } from "../appCore";
import heroImage from "../assets/ai-multiplexer-hero.png";

const releaseUrl = `https://github.com/${GITHUB_REPO}/releases/latest`;
const sourceUrl = `https://github.com/${GITHUB_REPO}`;

const aiServices = ["Claude", "ChatGPT", "Gemini", "Perplexity", "DeepSeek", "Grok"];

const featureCards = [
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
];

const workflows = [
  "Compare answers from several models side by side.",
  "Keep one AI writing while another researches.",
  "Separate personal and work identities without browser chaos.",
  "Park long-running chats in their own panes and keep moving.",
];

export function LandingPage() {
  return (
    <main className="landing-page">
      <div className="landing-orb orb-one" aria-hidden="true" />
      <div className="landing-orb orb-two" aria-hidden="true" />

      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="AI Chat Multiplexer home">
          <span className="landing-brand-mark">
            <AppLogo size={28} />
          </span>
          <span>AI Multiplexer</span>
        </a>
        <nav className="landing-links" aria-label="Landing page navigation">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#download">Download</a>
        </nav>
        <a className="landing-nav-cta" href={releaseUrl} target="_blank" rel="noreferrer">
          Get v{APP_VERSION}
        </a>
      </header>

      <section id="top" className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-kicker">
            <span className="pulse-dot" aria-hidden="true" />
            Local-first desktop AI workspace
          </div>
          <h1>Run every AI conversation like an operations room.</h1>
          <p className="landing-hero-lede">
            Claude, ChatGPT, Gemini, Perplexity, local tools, and custom URLs in one
            focused desktop grid — with isolated profiles for every account.
          </p>
          <div className="landing-actions">
            <a className="landing-btn primary" href={releaseUrl} target="_blank" rel="noreferrer">
              Download latest release
            </a>
            <a className="landing-btn secondary" href={sourceUrl} target="_blank" rel="noreferrer">
              View source
            </a>
          </div>
          <div className="landing-service-strip" aria-label="Supported AI services">
            {aiServices.map((service) => (
              <span key={service}>{service}</span>
            ))}
          </div>
        </div>

        <div className="landing-hero-visual" aria-label="AI Chat Multiplexer app preview">
          <div className="hero-window-bar">
            <span />
            <span />
            <span />
            <strong>Workspace 2 · 4 panes</strong>
          </div>
          <img src={heroImage} alt="AI Chat Multiplexer desktop workspace with four AI panes" />
        </div>
      </section>

      <section className="landing-trust-panel" aria-label="Product highlights">
        <div>
          <strong>4-way focus</strong>
          <span>Pane layouts for parallel thinking</span>
        </div>
        <div>
          <strong>Real sessions</strong>
          <span>Profile directories per account</span>
        </div>
        <div>
          <strong>Signed updates</strong>
          <span>GitHub release powered updater</span>
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="section-heading">
          <span>Why it feels different</span>
          <h2>Less tab juggling. More parallel AI work.</h2>
          <p>
            AI Chat Multiplexer keeps the powerful parts visible and pushes browser clutter out of the way.
          </p>
        </div>
        <div className="feature-grid">
          {featureCards.map((feature) => (
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
          <span>Designed for AI operators</span>
          <h2>A calmer workflow for multi-model work.</h2>
          <p>
            Open the right accounts, place each model where it belongs, then keep the whole project in one desktop surface.
          </p>
        </div>
        <div className="workflow-list">
          {workflows.map((item) => (
            <div className="workflow-item" key={item}>
              <span aria-hidden="true">✦</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section security-section">
        <div className="security-card">
          <span>Privacy posture</span>
          <h2>Local-first by default.</h2>
          <p>
            App state stays on your machine. Profile sessions live in separate local directories. Full backups can include
            cookies and session files, so treat them as private data. Some providers may still ask you to sign in again
            after restore because their security controls decide what can be reused.
          </p>
        </div>
        <div className="security-card muted-card">
          <span>Maintenance</span>
          <h2>Backup and updates are built in.</h2>
          <p>
            Export configuration, restore full app state when possible, and install signed releases through the desktop
            updater when a newer version is available.
          </p>
        </div>
      </section>

      <section id="download" className="landing-download">
        <div>
          <span>Current app version: {APP_VERSION}</span>
          <h2>Ready to replace your AI tab pile?</h2>
          <p>Download the latest desktop build, open a few panes, and turn your AI workflow into a focused command center.</p>
        </div>
        <a className="landing-btn primary large" href={releaseUrl} target="_blank" rel="noreferrer">
          Download AI Chat Multiplexer
        </a>
      </section>
    </main>
  );
}
