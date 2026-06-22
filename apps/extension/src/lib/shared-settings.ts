export interface SharedSettings {
  lastWorkspaceId: string
  lastAgent: "claude-code" | "codex" | "opencode"
  agentSettings: Record<string, { model?: string; effort?: string; permissionMode?: string }>
}

const STORAGE_KEYS = {
  workspace: "lastWorkspaceId",
  agent: "chandaoplus_last_agent",
  settings: "chandaoplus_agent_settings"
}

function hasStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local)
}

export async function getSettings(): Promise<SharedSettings> {
  if (!hasStorage()) {
    return { lastWorkspaceId: "", lastAgent: "claude-code", agentSettings: {} }
  }

  const result = await chrome.storage.local.get([STORAGE_KEYS.workspace, STORAGE_KEYS.agent, STORAGE_KEYS.settings])
  let agentSettings: Record<string, any> = {}
  try {
    const raw = result[STORAGE_KEYS.settings]
    agentSettings = typeof raw === "string" ? JSON.parse(raw) : (raw || {})
  } catch {}

  return {
    lastWorkspaceId: result[STORAGE_KEYS.workspace] || "",
    lastAgent: result[STORAGE_KEYS.agent] || "claude-code",
    agentSettings
  }
}

export function watchSettings(callback: (settings: SharedSettings) => void): () => void {
  if (!hasStorage()) return () => {}

  const listener = () => {
    getSettings().then(callback).catch(() => {})
  }

  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
