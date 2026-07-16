import { describe, expect, it } from "vitest";
import { createDefaultState } from "./appCore";
import { applyWorkflowTemplate, createWorkflowWorkspace } from "./workflowTemplates";

describe("workflow templates", () => {
  it.each([
    ["compare-three" as const, 3, ["chatgpt.com", "claude.ai", "gemini.google.com"]],
    ["coding-review" as const, 2, ["claude.ai", "chatgpt.com"]],
    ["research" as const, 3, ["www.perplexity.ai", "gemini.google.com", "chatgpt.com"]],
  ])("creates the %s workspace with local URL-only pane state", (id, count, hosts) => {
    const workspace = createWorkflowWorkspace(id, "Template", "prof-test");
    expect(workspace.panes).toHaveLength(count);
    expect(workspace.columns).toBe(count);
    expect(workspace.panes.every((pane) => pane.profileId === "prof-test")).toBe(true);
    expect(workspace.panes.map((pane) => new URL(pane.tabs[0].url).hostname)).toEqual(hosts);
    const serialized = JSON.stringify(workspace).toLowerCase();
    expect(serialized).not.toMatch(/prompt|credential|cookie|token|password/);
  });

  it("appends a template without changing existing workspaces or profiles", () => {
    const state = createDefaultState();
    const originalWorkspace = state.workspaces[0];
    const originalProfiles = state.profiles;
    const next = applyWorkflowTemplate(state, "coding-review", "Coding Review");

    expect(next.workspaces).toHaveLength(2);
    expect(next.workspaces[0]).toBe(originalWorkspace);
    expect(next.profiles).toBe(originalProfiles);
    expect(next.activeWorkspaceId).toBe(next.workspaces[1].id);
  });
});
