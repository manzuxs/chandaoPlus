import React, { useState, useEffect, useRef } from "react"
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

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  })
}

export function App() {
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [command, setCommand] = useState<ChatCommand>("estimate")
  const [agent, setAgent] = useState<"claude-code" | "codex">("claude-code")
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const [input, setInput] = useState("")
  const [showSkillManager, setShowSkillManager] = useState(false)
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false)
  const [copiedStatus, setCopiedStatus] = useState(false)
  const [pagePreviewCopied, setPagePreviewCopied] = useState(false)
  const [copyingPagePreview, setCopyingPagePreview] = useState(false)
  const [sessions, setSessions] = useState<SessionListItem[]>([])

  const selectAgent = (a: "claude-code" | "codex") => {
    setAgent(a)
    setAgentMenuOpen(false)
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { workspaces, skills, messages, sending, statusText, send, addWorkspace, updateWorkspace, deleteWorkspace, saveSkill, deleteSkill, newSession, loadSession, sessionId, sessionVersion } = useChatSession(workspaceId)

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

  // Load session list for workspace
  useEffect(() => {
    if (!workspaceId) return
    fetch(`http://127.0.0.1:3210/api/sessions?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSessions(data)
      })
      .catch(() => {})
  }, [workspaceId, sessionId, sessionVersion])

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

  const selectSlashCommand = (skill: Skill) => {
    setCommand(skill.id)
    setInput(skill.promptTemplate.split("\n")[0] || skill.name)
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

      <div className="app-body">
        <ChatThread
          messages={messages}
          skills={skills}
          onSelectSkill={(skill) => {
            setCommand(skill.id)
            setInput(skill.promptTemplate.split("\n")[0] || skill.name)
          }}
        />
      </div>

      <footer className="app-footer">
        {statusText && (
          <div
            className={`status-banner ${copiedStatus ? "copied" : ""}`}
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

        {messages.length > 0 && !sending && (
          <div className="quick-skills-row">
            {skills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                className="btn-pill btn-pill-secondary"
                onClick={() => selectSlashCommand(skill)}
              >
                {skill.icon} {skill.name}
              </button>
            ))}
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
                  <span className="slash-menu-item-icon">{skill.icon}</span>
                  <span className="slash-menu-item-name">{skill.name}</span>
                  <span className="slash-menu-item-desc">/{skill.id}</span>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (workspaceId && !sending && input.trim()) {
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
            <div className="agent-selector">
              <div
                className={`agent-selector-trigger ${agentMenuOpen ? "open" : ""}`}
                onClick={() => setAgentMenuOpen(!agentMenuOpen)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setAgentMenuOpen(!agentMenuOpen)
                  }
                }}
              >
                <span>{agent === "claude-code" ? "Claude Code" : "Codex"}</span>
                <ChevronDownIcon />
              </div>
              {agentMenuOpen && (
                <div className="agent-menu">
                  <div className="agent-menu-header">选择 Agent</div>
                  <div
                    className="agent-menu-item"
                    onClick={() => selectAgent("claude-code")}
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
                    className="agent-menu-item"
                    onClick={() => selectAgent("codex")}
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
                </div>
              )}
            </div>
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
                        </span>
                        <span className="history-session-item-time">
                          {formatSessionTime(s.updatedAt)}
                        </span>
                      </div>
                      <div className="history-session-item-meta">
                        <span className="history-session-item-preview">
                          {s.messageCount} 条消息{s.lastMessage ? ` · ${s.lastMessage}` : ""}
                        </span>
                        {isActive && <span className="history-session-item-current">当前</span>}
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
    </div>
  )
}

export default App
