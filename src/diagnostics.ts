import { APP_VERSION } from "./appCore";

export const DIAGNOSTICS_STORAGE_KEY = "ai-chat-multiplexer-diagnostics-v1";
export const DIAGNOSTICS_MAX_EVENTS = 200;
export const DIAGNOSTICS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type DiagnosticSeverity = "info" | "warning" | "error";

export type DiagnosticEvent = {
  timestamp: string;
  appVersion: string;
  component: string;
  code: string;
  severity: DiagnosticSeverity;
  context?: Record<string, string | number | boolean>;
};

export type DiagnosticRuntimeInfo = {
  os: string;
  arch: string;
  webviewVersion: string | null;
};

export type SupportBundle = {
  schemaVersion: 1;
  generatedAt: string;
  appVersion: string;
  runtime: DiagnosticRuntimeInfo;
  privacy: {
    localOnly: true;
    excludes: string[];
  };
  events: DiagnosticEvent[];
};

const ALLOWED_CONTEXT_KEYS = new Set([
  "action",
  "command",
  "flow",
  "providerHostname",
  "reasonCode",
  "result",
  "status",
  "target",
]);

let runtimeInfo: DiagnosticRuntimeInfo = {
  os: "unknown",
  arch: "unknown",
  webviewVersion: null,
};

function safeNowIso(now = Date.now()): string {
  try {
    return new Date(now).toISOString();
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
}

function sanitizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  if (trimmed.length > 80) return "redacted";
  if (/\b(?:bearer|token|cookie|password|secret|prompt)\b/i.test(trimmed)) {
    return "redacted";
  }
  if (/[/\\?#@]/.test(trimmed) || /^[A-Za-z]:/.test(trimmed)) {
    return "redacted";
  }
  if (
    /^(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+)$/i.test(trimmed) ||
    /^[a-f\d]{24,}$/i.test(trimmed) ||
    /^[A-Za-z\d_-]{32,}$/.test(trimmed) ||
    /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(trimmed)
  ) {
    return "redacted";
  }
  return trimmed.replace(/[^A-Za-z0-9_.-]/g, "-");
}

export function normalizeProviderHostname(value: string): string | null {
  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
    const hostname = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
    return hostname && hostname.length <= 253 ? hostname : null;
  } catch {
    return null;
  }
}

export function redactDiagnosticContext(
  context: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!context) return undefined;

  const redacted: Record<string, string | number | boolean> = {};
  Object.entries(context).forEach(([key, value]) => {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) return;
    if (typeof value === "number" && Number.isFinite(value)) {
      redacted[key] = value;
      return;
    }
    if (typeof value === "boolean") {
      redacted[key] = value;
      return;
    }
    if (typeof value !== "string") return;

    if (key === "providerHostname") {
      const hostname = normalizeProviderHostname(value);
      if (hostname) redacted[key] = hostname;
      return;
    }
    redacted[key] = sanitizeIdentifier(value);
  });

  return Object.keys(redacted).length > 0 ? redacted : undefined;
}

function readStoredEvents(now = Date.now()): DiagnosticEvent[] {
  try {
    const raw = window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    const cutoff = now - DIAGNOSTICS_RETENTION_MS;
    return parsed
      .map((event): DiagnosticEvent | null => {
        if (!event || typeof event !== "object") return null;
        const candidate = event as Partial<DiagnosticEvent>;
        const time = typeof candidate.timestamp === "string" ? Date.parse(candidate.timestamp) : NaN;
        if (
          !Number.isFinite(time) ||
          time < cutoff ||
          typeof candidate.component !== "string" ||
          typeof candidate.code !== "string" ||
          !["info", "warning", "error"].includes(candidate.severity ?? "")
        ) {
          return null;
        }
        const context =
          candidate.context && typeof candidate.context === "object" && !Array.isArray(candidate.context)
            ? redactDiagnosticContext(candidate.context)
            : undefined;
        return {
          timestamp: safeNowIso(time),
          appVersion: APP_VERSION,
          component: sanitizeIdentifier(candidate.component),
          code: sanitizeIdentifier(candidate.code),
          severity: candidate.severity as DiagnosticSeverity,
          context,
        };
      })
      .filter((event): event is DiagnosticEvent => event !== null)
      .slice(-DIAGNOSTICS_MAX_EVENTS);
  } catch {
    return [];
  }
}

function writeStoredEvents(events: DiagnosticEvent[]) {
  try {
    window.localStorage.setItem(
      DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify(events.slice(-DIAGNOSTICS_MAX_EVENTS)),
    );
  } catch {
    // Diagnostics must never become a dependency for the app to function.
  }
}

export function pruneDiagnostics(now = Date.now()): DiagnosticEvent[] {
  const events = readStoredEvents(now);
  writeStoredEvents(events);
  return events;
}

export function setDiagnosticRuntimeInfo(info: Partial<DiagnosticRuntimeInfo>) {
  runtimeInfo = {
    os: sanitizeIdentifier(info.os ?? runtimeInfo.os),
    arch: sanitizeIdentifier(info.arch ?? runtimeInfo.arch),
    webviewVersion: info.webviewVersion
      ? sanitizeIdentifier(info.webviewVersion)
      : runtimeInfo.webviewVersion,
  };
}

export function recordDiagnostic(input: {
  component: string;
  code: string;
  severity: DiagnosticSeverity;
  context?: Record<string, unknown>;
}) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const next: DiagnosticEvent = {
    timestamp: safeNowIso(now),
    appVersion: APP_VERSION,
    component: sanitizeIdentifier(input.component),
    code: sanitizeIdentifier(input.code),
    severity: input.severity,
    context: redactDiagnosticContext(input.context),
  };
  writeStoredEvents([...readStoredEvents(now), next]);
}

export function createSupportBundle(now = Date.now()): SupportBundle {
  return {
    schemaVersion: 1,
    generatedAt: safeNowIso(now),
    appVersion: APP_VERSION,
    runtime: { ...runtimeInfo },
    privacy: {
      localOnly: true,
      excludes: [
        "cookies and tokens",
        "prompts and chat content",
        "full URLs and query strings",
        "profile session files",
        "filesystem usernames and full paths",
      ],
    },
    events: pruneDiagnostics(now),
  };
}
