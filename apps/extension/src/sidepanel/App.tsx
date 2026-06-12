import React, { useState, useEffect, useRef } from "react"
import type { ChatCommand, Skill } from "@chandaoplus/shared"
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher"
import { ChatThread } from "./components/ChatThread"
import { SkillManager } from "./components/SkillManager"
import { useChatSession } from "./hooks/useChatSession"

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

export function App() {
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [command, setCommand] = useState<ChatCommand>("estimate")
  const [agent, setAgent] = useState<"claude-code" | "codex">("claude-code")
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const [input, setInput] = useState("")
  const [showSkillManager, setShowSkillManager] = useState(false)
  const [copiedStatus, setCopiedStatus] = useState(false)

  const selectAgent = (a: "claude-code" | "codex") => {
    setAgent(a)
    setAgentMenuOpen(false)
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { workspaces, skills, messages, sending, statusText, send, addWorkspace, updateWorkspace, deleteWorkspace, saveSkill, deleteSkill } = useChatSession()

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
            className="btn-icon"
            onClick={() => setShowSkillManager(!showSkillManager)}
            title="管理技能"
            aria-label="管理技能"
          >
            <BoltIcon />
          </button>
          <button
            type="button"
            className={`btn-icon ${copiedStatus ? "copied" : ""}`}
            onClick={handleStatusClick}
            aria-label="复制路径"
            title="复制上下文路径"
          >
            {copiedStatus ? <CheckIcon /> : <CopyIcon />}
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
              onClick={() =>
                send({
                  workspaceId,
                  agent,
                  command,
                  input
                })
              }
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
