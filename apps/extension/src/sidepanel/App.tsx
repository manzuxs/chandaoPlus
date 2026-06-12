import React, { useState, useEffect, useRef } from "react"
import type { ChatCommand, Skill } from "@chandaoplus/shared"
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher"
import { ChatThread } from "./components/ChatThread"
import { SkillManager } from "./components/SkillManager"
import { useChatSession } from "./hooks/useChatSession"
import { captureActiveTabPage, formatPageCapturePreview } from "../lib/page-capture"

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="9" y="9" width="10" height="10" rx="2" />
    <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export function App() {
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [command, setCommand] = useState<ChatCommand>("estimate")
  const [agent, setAgent] = useState<"claude-code" | "codex">("claude-code")
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const [input, setInput] = useState("")
  const [showSkillManager, setShowSkillManager] = useState(false)
  const [pagePreviewCopied, setPagePreviewCopied] = useState(false)
  const [copyingPagePreview, setCopyingPagePreview] = useState(false)

  const selectAgent = (a: "claude-code" | "codex") => {
    setAgent(a)
    setAgentMenuOpen(false)
  }
  const [copiedStatus, setCopiedStatus] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { workspaces, skills, messages, sending, statusText, send, addWorkspace, saveSkill, deleteSkill } = useChatSession()

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
    // Focus the textarea and set cursor at the end
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
      const preview = formatPageCapturePreview(capture)
      await navigator.clipboard.writeText(preview)
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
    if (copiedStatus) return "📋 已复制包绝对路径 ✔"
    if (text.startsWith("bundle ready: ")) {
      // Extract the last part (session ID) from the path
      const parts = text.split(/[/\\]/)
      const sessionId = parts[parts.length - 1] || ""
      return `🟢 上下文包就绪 (${sessionId.substring(0, 8)}) | 点击复制绝对路径`
    }
    return text
  }

  const selectedWorkspace = workspaces.find((item) => item.id === workspaceId)

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-left">
          <button
            type="button"
            className={`btn-copy-page ${pagePreviewCopied ? "copied" : ""}`}
            onClick={handleCopyPagePreview}
            aria-label="复制当前网页内容"
            title={pagePreviewCopied ? "已复制网页内容" : "复制当前要发送给 Agent 的网页内容"}
            disabled={copyingPagePreview}
          >
            {pagePreviewCopied ? <CheckIcon /> : <CopyIcon />}
          </button>
          <WorkspaceSwitcher
            value={workspaceId}
            onChange={handleWorkspaceChange}
            workspaces={workspaces}
            onAddWorkspace={addWorkspace}
          />
        </div>
        <button
          className="btn-manage-skills"
          onClick={() => setShowSkillManager(!showSkillManager)}
          title="管理技能"
        >
          ⚡
        </button>
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

      <footer className="app-footer-modern">
        {statusText && (
          <div
            className="status-banner-modern"
            onClick={handleStatusClick}
            title={statusText.startsWith("bundle ready: ") ? "点击一键复制本地绝对路径" : ""}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleStatusClick()
              }
            }}
          >
            <span className="status-icon">🟢</span>
            <span className="status-text">{formatStatusText(statusText)}</span>
          </div>
        )}

        {messages.length > 0 && !sending && (
          <div className="quick-skills-row">
            {skills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                className={`quick-skill-pill ${skill.id}`}
                onClick={() => selectSlashCommand(skill)}
              >
                {skill.icon} {skill.name}
              </button>
            ))}
          </div>
        )}

        <div className="input-card">
          {showSlashMenu && (
            <div className="slash-menu-modern">
              <div className="slash-menu-header">快捷技能 (点击选择)</div>
              {filteredCommands.map((skill) => (
                <div
                  key={skill.id}
                  className="slash-menu-item"
                  onClick={() => selectSlashCommand(skill)}
                >
                  <span className="item-icon">{skill.icon}</span>
                  <span className="item-name">{skill.name}</span>
                  <span className="item-desc">/{skill.id}</span>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder='输入 "/" 或选用快捷技能以使用命令...'
            disabled={sending}
          />
          <div className="input-toolbar">
            <div className="toolbar-right">
              <div className="agent-selector-wrapper">
                <div 
                  className="agent-selector-badge" 
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
                  <span className="arrow">▲</span>
                </div>
                {agentMenuOpen && (
                  <div className="agent-menu">
                    <div className="agent-menu-header">选择 Agent</div>
                    <div 
                      className={`agent-menu-item ${agent === "claude-code" ? "active" : ""}`}
                      onClick={() => selectAgent("claude-code")}
                      role="option"
                      aria-selected={agent === "claude-code"}
                    >
                      <div className="agent-item-info">
                        <div className="agent-item-name">Claude Code</div>
                        <div className="agent-item-desc">全方位编码助手</div>
                      </div>
                      {agent === "claude-code" && <span className="agent-check">●</span>}
                    </div>
                    <div 
                      className={`agent-menu-item ${agent === "codex" ? "active" : ""}`}
                      onClick={() => selectAgent("codex")}
                      role="option"
                      aria-selected={agent === "codex"}
                    >
                      <div className="agent-item-info">
                        <div className="agent-item-name">Codex</div>
                        <div className="agent-item-desc">快速代码生成</div>
                      </div>
                      {agent === "codex" && <span className="agent-check">●</span>}
                    </div>
                  </div>
                )}
              </div>
              <button
                className="btn-send-modern"
                aria-label="发送"
                disabled={!workspaceId || sending}
                onClick={() =>
                  send({
                    workspaceId,
                    agent,
                    command,
                    input
                  })
                }
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
