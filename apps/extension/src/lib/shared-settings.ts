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
  const safeResult = result || {}
  let agentSettings: Record<string, any> = {}
  try {
    const raw = safeResult[STORAGE_KEYS.settings]
    agentSettings = typeof raw === "string" ? JSON.parse(raw) : (raw || {})
  } catch {}

  return {
    lastWorkspaceId: safeResult[STORAGE_KEYS.workspace] || "",
    lastAgent: safeResult[STORAGE_KEYS.agent] || "claude-code",
    agentSettings
  }
}

export function watchSettings(callback: (settings: SharedSettings) => void): () => void {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => {}

  const listener = () => {
    getSettings().then(callback).catch(() => {})
  }

  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

export async function updateAgentSettingsInStorage(agent: string, config: { model?: string; effort?: string; permissionMode?: string }) {
  if (!hasStorage()) return
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings)
  const safeResult = result || {}
  let agentSettings: Record<string, any> = {}
  try {
    const raw = safeResult[STORAGE_KEYS.settings]
    agentSettings = typeof raw === "string" ? JSON.parse(raw) : (raw || {})
  } catch {}

  agentSettings[agent] = {
    ...(agentSettings[agent] || {}),
    ...config
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: agentSettings })
}

export async function setLastAgentInStorage(agent: string) {
  if (!hasStorage()) return
  await chrome.storage.local.set({ [STORAGE_KEYS.agent]: agent })
}

