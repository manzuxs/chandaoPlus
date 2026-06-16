import React, { useState, useEffect, useRef, useCallback } from "react"
import type { ChatCommand, SessionListItem, Skill } from "@chandaoplus/shared"
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher"
import { ChatThread } from "./components/ChatThread"
import { SkillManager } from "./components/SkillManager"
import { useChatSession } from "./hooks/useChatSession"
import { captureActiveTabPage, formatPageCapturePreview } from "../lib/page-capture"

// SVG Icons
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
)

const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

const HistoryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const renderSkillIcon = (skill: Skill) => {
  const iconType = skill.icon || ""
  if (iconType === "clock" || skill.id === "estimate") {
    return <ClockIcon />
  }
  if (iconType === "gear" || skill.id === "fix") {
    return <GearIcon />
  }
  if (iconType === "check" || skill.id === "verify") {
    return <CheckIcon />
  }
  return <BoltIcon />
}

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const HandIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 11V6a2 2 0 00-2-2v0a2 2 0 00-2 2v5m-4 0V4a2 2 0 00-2-2v0a2 2 0 00-2 2v7M6 15v-2a2 2 0 00-2-2v0a2 2 0 00-2 2v6c0 4.4 3.6 8 8 8h3c3.9 0 7-3.1 7-7v-3a2 2 0 00-2-2v0a2 2 0 00-2 2v3" />
  </svg>
)

const AlertCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)

function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  })
}

export function App() {
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmData, setConfirmData] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)

  const requestConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmData({ title, message, onConfirm })
    setConfirmOpen(true)
  }
  const [command, setCommand] = useState<ChatCommand>("default")
  const [agent, setAgent] = useState<"claude-code" | "codex" | "opencode">(() => {
    try {
      const saved = localStorage.getItem("chandaoplus_agent_settings")
      if (saved) {
        const settings = JSON.parse(saved)
        const lastAgent = localStorage.getItem("chandaoplus_last_agent")
        if (lastAgent && settings[lastAgent]) return lastAgent as "claude-code" | "codex" | "opencode"
      }
    } catch (e) {}
    return "claude-code"
  })
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const [agentModelMenuOpen, setAgentModelMenuOpen] = useState(false)
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [input, setInput] = useState("")

  const [agentSettings, setAgentSettings] = useState<Record<string, { model?: string; effort?: "low" | "medium" | "high" | "xhigh" | "max" }>>(() => {
    try {
      const saved = localStorage.getItem("chandaoplus_agent_settings")
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error(e)
    }
    return {
      "claude-code": { model: "default", effort: "medium" },
      "codex": { model: "default", effort: "medium" },
      "opencode": { model: "default", effort: "medium" }
    }
  })

  const updateAgentSettings = (targetAgent: string, config: { model?: string; effort?: "low" | "medium" | "high" | "xhigh" | "max" }) => {
    setAgentSettings((prev) => {
      const next = {
        ...prev,
        [targetAgent]: {
          ...prev[targetAgent],
          ...config
        }
      }
      localStorage.setItem("chandaoplus_agent_settings", JSON.stringify(next))
      return next
    })
  }
  const [showSkillManager, setShowSkillManager] = useState(false)
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false)
  const [copiedStatus, setCopiedStatus] = useState(false)
  const [pagePreviewCopied, setPagePreviewCopied] = useState(false)
  const [copyingPagePreview, setCopyingPagePreview] = useState(false)
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { workspaces, skills, messages, sending, statusText, send, stop, addWorkspace, updateWorkspace, deleteWorkspace, deleteSession, saveSkill, deleteSkill, newSession, loadSession, sessionId, sessionVersion, agent: sessionAgent, model, effort, permissionMode, setSessionConfig } = useChatSession(workspaceId)

  // 同步 agent 状态：加载会话时跟随会话渠道，新会话时将本地偏好同步到 temp
  const prevSessionIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (sessionId && sessionAgent && sessionAgent !== agent) {
      setAgent(sessionAgent)
      localStorage.setItem("chandaoplus_last_agent", sessionAgent)
    } else if (!sessionId) {
      const saved = agentSettings[agent] || { model: "default", effort: "medium" }
      setSessionConfig({
        agent,
        model: saved.model || "default",
        effort: saved.effort || "medium"
      })
    }
  }, [sessionId, sessionAgent, agent, agentSettings, setSessionConfig])

  const [cachedModels, setCachedModels] = useState<Record<string, { id: string; name: string; hasReasoning: boolean }[]>>({
    "claude-code": [],
    "codex": [],
    "opencode": []
  })
  const [modelsLoading, setModelsLoading] = useState(false)
  const [hoveredAgent, setHoveredAgent] = useState<"claude-code" | "codex" | "opencode" | null>(null)

  const activeFetchAgent = hoveredAgent || agent

  const fetchModelsForAgent = useCallback(async (targetAgent: "claude-code" | "codex" | "opencode", force = false) => {
    if (cachedModels[targetAgent]?.length > 0 && !force) return

    setModelsLoading(true)
    try {
      const res = await fetch(`http://127.0.0.1:3210/api/chat/models?agent=${targetAgent}`)
      if (res.ok) {
        const data = await res.json()
        setCachedModels((prev) => ({
          ...prev,
          [targetAgent]: data
        }))
      }
    } catch (err) {
      console.error(`Failed to prefetch models for ${targetAgent}:`, err)
    } finally {
      setModelsLoading(false)
    }
  }, [cachedModels])

  useEffect(() => {
    const prefetch = async () => {
      const agents = ["claude-code", "codex", "opencode"] as const
      await Promise.all(
        agents.map(async (a) => {
          try {
            const res = await fetch(`http://127.0.0.1:3210/api/chat/models?agent=${a}`)
            if (res.ok) {
              const data = await res.json()
              setCachedModels((prev) => ({
                ...prev,
                [a]: data
              }))
            }
          } catch (e) {
            console.error(`Prefetch fallback error for ${a}:`, e)
          }
        })
      )
    }
    prefetch()
  }, [])

  useEffect(() => {
    if (agentMenuOpen) {
      fetchModelsForAgent(activeFetchAgent)
    }
  }, [agentMenuOpen, activeFetchAgent, fetchModelsForAgent])

  useEffect(() => {
    if (!agentMenuOpen) {
      setHoveredAgent(null)
    }
  }, [agentMenuOpen])

  const currentSession = sessions.find((s) => s.id === sessionId)
  const currentTitle = currentSession?.title || (sessionId ? "未命名会话" : "新对话")

  const selectAgent = (a: "claude-code" | "codex" | "opencode") => {
    setAgent(a)
    setAgentMenuOpen(false)
    setAgentModelMenuOpen(false)
    setPermissionMenuOpen(false)
    setModelMenuOpen(false)
    localStorage.setItem("chandaoplus_last_agent", a)

    const saved = agentSettings[a] || { model: "default", effort: "medium" }
    setSessionConfig({
      agent: a,
      model: saved.model || "default",
      effort: saved.effort || "medium"
    })
  }

  // Load last used workspace id
  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["lastWorkspaceId"], (result: Record<string, any>) => {
        if (result.lastWorkspaceId) {
          setWorkspaceId(result.lastWorkspaceId)
        }
      })
    }
  }, [])

  // Load session list for workspace (only on workspace change or create/delete, NOT on session switch)
  useEffect(() => {
    if (!workspaceId) return
    fetch(`http://127.0.0.1:3210/api/sessions?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSessions(data)
      })
      .catch(() => {})
  }, [workspaceId, sessionVersion])

  const handleSwitchSession = (newSessionId: string) => {
    loadSession(newSessionId)
  }

  const handleWorkspaceChange = (id: string) => {
    setWorkspaceId(id)
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ lastWorkspaceId: id })
    }
  }

  const handleInputChange = (val: string) => {
    setInput(val)
  }

  const getFilteredCommands = () => {
    if (!input.startsWith("/")) return []
    const query = input.slice(1).toLowerCase().trim()
    if (!query) return skills
    return skills.filter(skill =>
      skill.id.toLowerCase().includes(query) ||
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.keywords.some(kw => kw.includes(query))
    )
  }

  const filteredCommands = getFilteredCommands()
  const showSlashMenu = input.startsWith("/") && filteredCommands.length > 0
  const selectedSkill = command && command !== "default" ? skills.find((s) => s.id === command) : null

  const selectSlashCommand = (skill: Skill) => {
    setCommand(skill.id)
    setInput("") // 选中技能时清空输入框，不再填充首行文本
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    }, 50)
  }

  const handleStatusClick = async () => {
    if (statusText && statusText.startsWith("bundle ready: ")) {
      const pathText = statusText.replace("bundle ready: ", "").trim()
      try {
        await navigator.clipboard.writeText(pathText)
        setCopiedStatus(true)
        setTimeout(() => setCopiedStatus(false), 2000)
      } catch (err) {
        console.error("Failed to copy path:", err)
      }
    }
  }

  const handleCopyPagePreview = async () => {
    if (copyingPagePreview) return

    setCopyingPagePreview(true)
    try {
      const capture = await captureActiveTabPage()
      await navigator.clipboard.writeText(formatPageCapturePreview(capture))
      setPagePreviewCopied(true)
      setTimeout(() => setPagePreviewCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy page preview:", err)
    } finally {
      setCopyingPagePreview(false)
    }
  }

  const formatStatusText = (text: string) => {
    if (!text) return ""
    if (copiedStatus) return "已复制路径"
    if (text.startsWith("bundle ready: ")) {
      const parts = text.split(/[/\\]/)
      const sessionId = parts[parts.length - 1] || ""
      return `上下文就绪 (${sessionId.substring(0, 8)}) · 点击复制`
    }
    return text
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-left" title={currentTitle}>
          <span className="current-session-title">{currentTitle}</span>
        </div>
        <div className="app-header-right">
          <WorkspaceSwitcher
            value={workspaceId}
            onChange={handleWorkspaceChange}
            workspaces={workspaces}
            onAddWorkspace={addWorkspace}
            onUpdateWorkspace={updateWorkspace}
            onDeleteWorkspace={deleteWorkspace}
          />
          <button
            type="button"
            className={`btn-icon ${pagePreviewCopied ? "copied" : ""}`}
            onClick={handleCopyPagePreview}
            aria-label="复制当前网页内容"
            title={pagePreviewCopied ? "已复制当前网页内容" : "复制当前要发送给 Agent 的网页内容"}
            disabled={copyingPagePreview}
          >
            {pagePreviewCopied ? <CheckIcon /> : <CopyIcon />}
          </button>

          <button
            type="button"
            className="btn-icon"
            onClick={() => setShowHistoryDrawer(true)}
            title="历史会话"
            aria-label="历史会话"
          >
            <HistoryIcon />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => setShowSkillManager(!showSkillManager)}
            title="管理技能"
            aria-label="管理技能"
          >
            <BoltIcon />
          </button>
        </div>
      </header>

      {showSkillManager && (
        <SkillManager
          skills={skills}
          onSave={saveSkill}
          onDelete={deleteSkill}
          onClose={() => setShowSkillManager(false)}
        />
      )}

      <div className="app-body" onClick={() => {
        setPermissionMenuOpen(false)
        setModelMenuOpen(false)
        setAgentMenuOpen(false)
        setAgentModelMenuOpen(false)
      }}>
        <ChatThread
          messages={messages}
          skills={skills}
          onSelectSkill={selectSlashCommand}
          sending={sending}
        />
      </div>

      <footer className="app-footer">
        {statusText && (
          <div
            className={`status-banner ${copiedStatus ? "copied" : ""} ${statusText.startsWith("连接断开") ? "reconnecting" : ""}`}
            onClick={handleStatusClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleStatusClick()
              }
            }}
          >
            {!copiedStatus && <span className="status-icon" />}
            <span>{formatStatusText(statusText)}</span>
          </div>
        )}



        <div className="input-card">
          {showSlashMenu && (
            <div className="slash-menu">
              <div className="slash-menu-header">快捷技能</div>
              {filteredCommands.map((skill) => (
                <div
                  key={skill.id}
                  className="slash-menu-item"
                  onClick={() => selectSlashCommand(skill)}
                >
                  <span className="slash-menu-item-icon">{renderSkillIcon(skill)}</span>
                  <span className="slash-menu-item-name">{skill.name}</span>
                  <span className="slash-menu-item-desc">/{skill.id}</span>
                </div>
              ))}
            </div>
          )}
          {selectedSkill && (
            <div className="input-skill-badge">
              <span className="skill-badge-icon">{renderSkillIcon(selectedSkill)}</span>
              <span className="skill-badge-name">{selectedSkill.name}</span>
              <button
                type="button"
                className="skill-badge-close"
                onClick={() => setCommand("default")}
                title="取消使用该技能"
                aria-label="取消技能"
              >
                <XIcon />
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onClick={() => {
              setPermissionMenuOpen(false)
              setModelMenuOpen(false)
              setAgentMenuOpen(false)
              setAgentModelMenuOpen(false)
            }}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                const hasInput = input.trim()
                const hasSkill = command && command !== "default"
                if (workspaceId && !sending && (hasInput || hasSkill)) {
                  send({
                    workspaceId,
                    agent,
                    command,
                    input
                  })
                  setInput("")
                }
              }
            }}
            placeholder='输入 "/" 查看可用技能...'
            disabled={sending}
          />
          <div className="input-toolbar">
            <div className="input-toolbar-left">
              {/* Agent 选择器 */}
              <div className="agent-selector">
                <div
                  className={`agent-selector-trigger ${agentMenuOpen ? "open" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setAgentMenuOpen(!agentMenuOpen)
                    setAgentModelMenuOpen(false)
                    setPermissionMenuOpen(false)
                    setModelMenuOpen(false)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setAgentMenuOpen(!agentMenuOpen)
                      setAgentModelMenuOpen(false)
                      setPermissionMenuOpen(false)
                      setModelMenuOpen(false)
                    }
                  }}
                >
                  <span>
                    {agent === "claude-code" ? "Claude Code" : agent === "codex" ? "Codex" : "OpenCode"}
                  </span>
                  <ChevronDownIcon />
                </div>
                {agentMenuOpen && (
                  <div className="agent-menu-container">
                    <div className="agent-menu-header">选择 Agent</div>
                    <div
                      className={`agent-menu-item`}
                      onClick={() => {
                        selectAgent("claude-code")
                      }}
                      role="option"
                      aria-selected={agent === "claude-code"}
                    >
                      <div>
                        <div className="agent-menu-item-name">Claude Code</div>
                        <div className="agent-menu-item-desc">全方位编码助手</div>
                      </div>
                      {agent === "claude-code" && (
                        <span className="agent-check"><CheckIcon /></span>
                      )}
                    </div>
                    <div
                      className={`agent-menu-item`}
                      onClick={() => {
                        selectAgent("codex")
                      }}
                      role="option"
                      aria-selected={agent === "codex"}
                    >
                      <div>
                        <div className="agent-menu-item-name">Codex</div>
                        <div className="agent-menu-item-desc">快速代码生成</div>
                      </div>
                      {agent === "codex" && (
                        <span className="agent-check"><CheckIcon /></span>
                      )}
                    </div>
                    <div
                      className={`agent-menu-item`}
                      onClick={() => {
                        selectAgent("opencode")
                      }}
                      role="option"
                      aria-selected={agent === "opencode"}
                    >
                      <div>
                        <div className="agent-menu-item-name">OpenCode</div>
                        <div className="agent-menu-item-desc">开源高效编程助手</div>
                      </div>
                      {agent === "opencode" && (
                        <span className="agent-check"><CheckIcon /></span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 模型选择器 */}
              <div className="agent-model-selector">
                <div
                  className={`agent-model-selector-trigger ${agentModelMenuOpen ? "open" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setAgentModelMenuOpen(!agentModelMenuOpen)
                    setAgentMenuOpen(false)
                    setPermissionMenuOpen(false)
                    setModelMenuOpen(false)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setAgentModelMenuOpen(!agentModelMenuOpen)
                      setAgentMenuOpen(false)
                      setPermissionMenuOpen(false)
                      setModelMenuOpen(false)
                    }
                  }}
                >
                  <span>
                    {model && model !== "default" ? model.split("/").pop() : "默认模型"}
                  </span>
                  <ChevronDownIcon />
                </div>
                {agentModelMenuOpen && (
                  <div className="agent-model-menu">
                    <div className="agent-model-menu-header">选择模型</div>
                    {modelsLoading && (!cachedModels[agent] || cachedModels[agent].length === 0) ? (
                      <div className="agent-models-loading-container">
                        <div className="loading-spinner"></div>
                        <span>加载模型中...</span>
                      </div>
                    ) : (
                      <div className="agent-model-list">
                        {(cachedModels[agent] || []).map((m) => {
                          const isSelected = model === m.id || (m.id === "default" && model === "default")
                          const slashIndex = m.name.indexOf("/")
                          const prefix = slashIndex > -1 ? m.name.slice(0, slashIndex + 1) : ""
                          const mainName = slashIndex > -1 ? m.name.slice(slashIndex + 1) : m.name

                          return (
                            <div
                              key={m.id}
                              className={`agent-model-item ${isSelected ? "selected" : ""}`}
                              onClick={() => {
                                setSessionConfig({ model: m.id })
                                updateAgentSettings(agent, { model: m.id })
                                setAgentModelMenuOpen(false)
                              }}
                            >
                              <span className="agent-model-item-name" title={m.name}>
                                {prefix && <span className="agent-model-prefix">{prefix}</span>}
                                <span className="agent-model-main-name">{mainName}</span>
                              </span>
                              {isSelected && (
                                <span className="agent-model-check"><CheckIcon /></span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 权限级别选择器 */}
              <div className="permission-selector">
                <div
                  className={`permission-selector-trigger ${permissionMenuOpen ? "open" : ""} ${permissionMode === "full" ? "warning" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPermissionMenuOpen(!permissionMenuOpen)
                    setAgentMenuOpen(false)
                    setAgentModelMenuOpen(false)
                    setModelMenuOpen(false)
                  }}
                  role="button"
                  tabIndex={0}
                  title="审批与权限策略"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setPermissionMenuOpen(!permissionMenuOpen)
                      setAgentMenuOpen(false)
                      setAgentModelMenuOpen(false)
                      setModelMenuOpen(false)
                    }
                  }}
                >
                  <span className="permission-icon">
                    {permissionMode === "ask" && <HandIcon />}
                    {permissionMode === "auto" && <ShieldIcon />}
                    {permissionMode === "full" && <AlertCircleIcon />}
                    {permissionMode === "custom" && <GearIcon />}
                  </span>
                  <span>
                    {permissionMode === "ask" && "请求批准"}
                    {permissionMode === "auto" && "替我审批"}
                    {permissionMode === "full" && "完全访问"}
                    {permissionMode === "custom" && "自定义"}
                  </span>
                  <ChevronDownIcon />
                </div>
                {permissionMenuOpen && (
                  <div className="permission-menu">
                    <div className="permission-menu-header">
                      应如何批准 {agent === "claude-code" ? "Claude" : "Codex"} 操作？
                    </div>
                    <div
                      className="permission-menu-item"
                      onClick={() => {
                        setSessionConfig({ permissionMode: "ask" })
                        setPermissionMenuOpen(false)
                      }}
                    >
                      <span className="item-icon"><HandIcon /></span>
                      <div className="item-details">
                        <div className="item-name">请求批准</div>
                        <div className="item-desc">编辑外部文件和使用互联网时始终询问</div>
                      </div>
                      {permissionMode === "ask" && <span className="item-check"><CheckIcon /></span>}
                    </div>
                    <div
                      className="permission-menu-item"
                      onClick={() => {
                        setSessionConfig({ permissionMode: "auto" })
                        setPermissionMenuOpen(false)
                      }}
                    >
                      <span className="item-icon"><ShieldIcon /></span>
                      <div className="item-details">
                        <div className="item-name">替我审批</div>
                        <div className="item-desc">仅对检测到的风险操作请求批准</div>
                      </div>
                      {permissionMode === "auto" && <span className="item-check"><CheckIcon /></span>}
                    </div>
                    <div
                      className={`permission-menu-item ${permissionMode === "full" ? "active" : ""}`}
                      onClick={() => {
                        setSessionConfig({ permissionMode: "full" })
                        setPermissionMenuOpen(false)
                      }}
                    >
                      <span className="item-icon warning"><AlertCircleIcon /></span>
                      <div className="item-details">
                        <div className="item-name">完全访问权限</div>
                        <div className="item-desc">可不受限制地访问互联网和您电脑上的任何文件</div>
                      </div>
                      {permissionMode === "full" && <span className="item-check"><CheckIcon /></span>}
                    </div>
                    <div
                      className="permission-menu-item"
                      onClick={() => {
                        setSessionConfig({ permissionMode: "custom" })
                        setPermissionMenuOpen(false)
                      }}
                    >
                      <span className="item-icon"><GearIcon /></span>
                      <div className="item-details">
                        <div className="item-name">自定义 (config.toml)</div>
                        <div className="item-desc">使用配置文件中定义的权限</div>
                      </div>
                      {permissionMode === "custom" && <span className="item-check"><CheckIcon /></span>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="input-toolbar-right">
              {/* 思考强度选择器 */}
              <div className="model-selector">
                <div
                  className={`model-selector-trigger ${modelMenuOpen ? "open" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setModelMenuOpen(!modelMenuOpen)
                    setAgentMenuOpen(false)
                    setAgentModelMenuOpen(false)
                    setPermissionMenuOpen(false)
                  }}
                  role="button"
                  tabIndex={0}
                  title="思考强度"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setModelMenuOpen(!modelMenuOpen)
                      setAgentMenuOpen(false)
                      setAgentModelMenuOpen(false)
                      setPermissionMenuOpen(false)
                    }
                  }}
                >
                  <span>
                    推理：
                    {effort === "low" && "低"}
                    {effort === "medium" && "中"}
                    {effort === "high" && "高"}
                    {(effort === "xhigh" || effort === "max") && "超高"}
                  </span>
                  <ChevronDownIcon />
                </div>
                {modelMenuOpen && (
                  <div className="model-menu">
                    <div className="model-menu-section reasoning-section">
                      <div className="model-menu-header">推理</div>
                      <div className={`model-option ${effort === "low" ? "active" : ""}`} onClick={() => { setSessionConfig({ effort: "low" }); updateAgentSettings(agent, { effort: "low" }); setModelMenuOpen(false); }}>
                        <span>低</span>
                        {effort === "low" && <span className="item-check"><CheckIcon /></span>}
                      </div>
                      <div className={`model-option ${effort === "medium" ? "active" : ""}`} onClick={() => { setSessionConfig({ effort: "medium" }); updateAgentSettings(agent, { effort: "medium" }); setModelMenuOpen(false); }}>
                        <span>中</span>
                        {effort === "medium" && <span className="item-check"><CheckIcon /></span>}
                      </div>
                      <div className={`model-option ${effort === "high" ? "active" : ""}`} onClick={() => { setSessionConfig({ effort: "high" }); updateAgentSettings(agent, { effort: "high" }); setModelMenuOpen(false); }}>
                        <span>高</span>
                        {effort === "high" && <span className="item-check"><CheckIcon /></span>}
                      </div>
                      <div className={`model-option ${(effort === "xhigh" || effort === "max") ? "active" : ""}`} onClick={() => { setSessionConfig({ effort: "xhigh" }); updateAgentSettings(agent, { effort: "xhigh" }); setModelMenuOpen(false); }}>
                        <span>超高</span>
                        {(effort === "xhigh" || effort === "max") && <span className="item-check"><CheckIcon /></span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 发送 / 停止 按钮 */}
              {sending ? (
                <button
                  type="button"
                  className="btn-send btn-stop"
                  aria-label="停止"
                  onClick={() => stop()}
                >
                  <StopIcon />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-send"
                  aria-label="发送"
                  disabled={!workspaceId || sending}
                  onClick={() => {
                    send({
                      workspaceId,
                      agent,
                      command,
                      input
                    })
                    setInput("")
                  }}
                >
                  <SendIcon />
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>

      {showHistoryDrawer && (
        <>
          <div className="history-overlay" onClick={() => setShowHistoryDrawer(false)} />
          <div className="history-drawer">
            <div className="history-drawer-header">
              <div>
                <h3>历史会话</h3>
                <p>共 {sessions.length} 个历史会话</p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setShowHistoryDrawer(false)} aria-label="关闭">
                <XIcon />
              </button>
            </div>
            <div className="history-drawer-body">
              {sessionId && (
                <button
                  type="button"
                  className="btn-pill btn-pill-primary"
                  style={{ width: "100%", justifyContent: "center", marginBottom: "var(--space-md)" }}
                  onClick={() => {
                    newSession();
                    setShowHistoryDrawer(false);
                  }}
                >
                  + 新建会话
                </button>
              )}
              <div className="history-session-list">
                {sessions.map((s) => {
                  const isActive = s.id === sessionId;
                  return (
                    <div
                      key={s.id}
                      className={`history-session-item ${isActive ? "active" : ""}`}
                      onClick={() => {
                        loadSession(s.id);
                        setShowHistoryDrawer(false);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          loadSession(s.id);
                          setShowHistoryDrawer(false);
                        }
                      }}
                    >
                      <div className="history-session-item-top">
                        <span className="history-session-item-title">
                          {s.title || s.id.slice(0, 8)}
                          {s.runningTaskId && (
                            <span className={`history-session-running-badge ${s.runningStatus === "stopping" ? "stopping" : "running"}`} title={s.runningStatus === "stopping" ? "正在停止后台任务" : "后台任务运行中"}>
                              <span className="running-dot" />
                              {s.runningStatus === "stopping" ? "停止中" : "运行中"}
                            </span>
                          )}
                        </span>
                        <span className="history-session-item-time">
                          {formatSessionTime(s.updatedAt)}
                        </span>
                      </div>
                      <div className="history-session-item-meta">
                        <span className="history-session-item-preview">
                          {s.messageCount} 条消息{s.lastMessage ? ` · ${s.lastMessage}` : ""}
                        </span>
                        <div className="history-session-item-meta-right" onClick={(e) => e.stopPropagation()}>
                          {isActive && <span className="history-session-item-current">当前</span>}
                          {s.runningTaskId && (
                            <button
                              type="button"
                              className="btn-stop-session-quick"
                              onClick={(e) => {
                                e.stopPropagation();
                                stop(s.id, s.runningTaskId);
                              }}
                              title="终止后台任务"
                              aria-label="终止后台任务"
                            >
                              <StopIcon />
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-delete-session"
                            onClick={(e) => {
                              e.stopPropagation();
                              requestConfirm("删除会话", "确定要删除这个会话吗？删除后将无法恢复该会话下的所有内容。", () => {
                                deleteSession(s.id, s.runningTaskId);
                              });
                            }}
                            title="删除会话"
                            aria-label="删除会话"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sessions.length === 0 && (
                  <div className="empty-list-text">暂无历史会话</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {confirmOpen && confirmData && (
        <>
          <div className="confirm-overlay" onClick={() => setConfirmOpen(false)} />
          <div className="confirm-card">
            <div className="confirm-card-body">
              <h4>{confirmData.title}</h4>
              <p>{confirmData.message}</p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="btn-pill btn-pill-secondary"
                  onClick={() => setConfirmOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn-pill btn-pill-primary"
                  style={{ backgroundColor: "var(--accent-magenta)", color: "var(--canvas)" }}
                  onClick={() => {
                    confirmData.onConfirm()
                    setConfirmOpen(false)
                  }}
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
