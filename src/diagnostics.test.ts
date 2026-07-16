import { beforeEach, describe, expect, it } from "vitest";
import {
  createSupportBundle,
  DIAGNOSTICS_MAX_EVENTS,
  DIAGNOSTICS_RETENTION_MS,
  DIAGNOSTICS_STORAGE_KEY,
  pruneDiagnostics,
  recordDiagnostic,
  redactDiagnosticContext,
  setDiagnosticRuntimeInfo,
} from "./diagnostics";

describe("diagnostics privacy", () => {
  beforeEach(() => window.localStorage.clear());

  it("drops unsafe keys and normalizes provider URLs to hostnames", () => {
    const redacted = redactDiagnosticContext({
      providerHostname: "https://user:pass@example.com/private?q=prompt#token",
      action: "reload",
      token: "secret-token",
      cookie: "session=secret",
      prompt: "private prompt",
      path: "C:\\Users\\Alice\\secret.txt",
      url: "https://example.com/private?token=secret",
    });
    expect(redacted).toEqual({ providerHostname: "example.com", action: "reload" });
  });

  it("redacts opaque credential and account identifier shapes", () => {
    expect(redactDiagnosticContext({ action: "sk-testcredentialvalue" })).toEqual({
      action: "redacted",
    });
    expect(redactDiagnosticContext({ target: "550e8400-e29b-41d4-a716-446655440000" })).toEqual({
      target: "redacted",
    });
    expect(redactDiagnosticContext({ reasonCode: "a".repeat(81) })).toEqual({
      reasonCode: "redacted",
    });
  });

  it("exports only redacted allowlisted context", () => {
    setDiagnosticRuntimeInfo({ os: "windows", arch: "x86_64", webviewVersion: "136.0" });
    recordDiagnostic({
      component: "webview",
      code: "NAVIGATION_FAILED",
      severity: "error",
      context: {
        providerHostname: "https://chatgpt.com/c/secret?token=abc",
        reasonCode: "native-command",
        prompt: "do not export me",
      },
    });
    const serialized = JSON.stringify(createSupportBundle());
    expect(serialized).toContain("chatgpt.com");
    expect(serialized).toContain("NAVIGATION_FAILED");
    expect(serialized).not.toContain("do not export me");
    expect(serialized).not.toContain("token=abc");
    expect(serialized).not.toContain("/c/secret");
  });

  it("prunes expired events and caps the ring buffer", () => {
    const now = Date.now();
    window.localStorage.setItem(
      DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify([
        {
          timestamp: new Date(now - DIAGNOSTICS_RETENTION_MS - 1).toISOString(),
          appVersion: "old",
          component: "app",
          code: "EXPIRED",
          severity: "error",
        },
      ]),
    );
    expect(pruneDiagnostics(now)).toEqual([]);

    for (let index = 0; index < DIAGNOSTICS_MAX_EVENTS + 20; index += 1) {
      recordDiagnostic({ component: "test", code: `EVENT_${index}`, severity: "info" });
    }
    const bundle = createSupportBundle();
    expect(bundle.events).toHaveLength(DIAGNOSTICS_MAX_EVENTS);
    expect(bundle.events.at(-1)?.code).toBe(`EVENT_${DIAGNOSTICS_MAX_EVENTS + 19}`);
  });

  it("re-sanitizes persisted events before support export", () => {
    window.localStorage.setItem(
      DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify([
        {
          timestamp: new Date().toISOString(),
          appVersion: "C:\\Users\\Alice\\private",
          component: "https://example.com/private?token=abc",
          code: "STORED_EVENT",
          severity: "error",
          context: {
            providerHostname: "https://example.com/chat/private?token=abc",
            action: "Alice@example.com",
            prompt: "private prompt",
          },
        },
      ]),
    );

    const serialized = JSON.stringify(createSupportBundle());
    expect(serialized).toContain("example.com");
    expect(serialized).toContain("STORED_EVENT");
    expect(serialized).not.toContain("Alice");
    expect(serialized).not.toContain("token=abc");
    expect(serialized).not.toContain("private prompt");
  });
});
