import {
  createId,
  DEFAULT_PROFILE_ID,
  getOriginFallbackIcon,
  type AppState,
  type ChatPane,
  type Workspace,
} from "./appCore";

export type WorkflowTemplateId = "compare-three" | "coding-review" | "research";

type TemplatePane = {
  title: string;
  url: string;
};

const TEMPLATE_PANES: Record<WorkflowTemplateId, TemplatePane[]> = {
  "compare-three": [
    { title: "ChatGPT", url: "https://chatgpt.com" },
    { title: "Claude", url: "https://claude.ai" },
    { title: "Gemini", url: "https://gemini.google.com" },
  ],
  "coding-review": [
    { title: "Claude", url: "https://claude.ai" },
    { title: "ChatGPT", url: "https://chatgpt.com" },
  ],
  research: [
    { title: "Perplexity", url: "https://www.perplexity.ai" },
    { title: "Gemini", url: "https://gemini.google.com" },
    { title: "ChatGPT", url: "https://chatgpt.com" },
  ],
};

function createTemplatePane(templatePane: TemplatePane, profileId: string): ChatPane {
  const tabId = createId("tab");
  return {
    id: createId("pane"),
    title: templatePane.title,
    profileId,
    activeTabId: tabId,
    tabs: [
      {
        id: tabId,
        title: templatePane.title,
        url: templatePane.url,
        loadedUrl: templatePane.url,
        currentUrl: templatePane.url,
        faviconUrl: getOriginFallbackIcon(templatePane.url),
        isLoading: true,
      },
    ],
  };
}

export function createWorkflowWorkspace(
  templateId: WorkflowTemplateId,
  name: string,
  profileId = DEFAULT_PROFILE_ID,
): Workspace {
  const panes = TEMPLATE_PANES[templateId].map((pane) => createTemplatePane(pane, profileId));
  return {
    id: createId("ws"),
    name,
    columns: Math.min(3, panes.length),
    panes,
  };
}

export function applyWorkflowTemplate(
  state: AppState,
  templateId: WorkflowTemplateId,
  name: string,
): AppState {
  const profileId = state.profiles[0]?.id ?? DEFAULT_PROFILE_ID;
  const workspace = createWorkflowWorkspace(templateId, name, profileId);
  return {
    ...state,
    workspaces: [...state.workspaces, workspace],
    activeWorkspaceId: workspace.id,
  };
}
