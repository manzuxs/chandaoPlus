import React, { useState, useEffect, useRef } from "react"
import type { ChatCommand } from "@chandaoplus/shared"
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher"
import { ChatThread } from "./components/ChatThread"
import { useChatSession } from "./hooks/useChatSession"

const COMMAND_PRESETS: Record<ChatCommand, string> = {
  estimate: "请评估这个问题的修复工期、风险和建议方案。"
}

const ALL_SLASH_COMMANDS = [
  {
    id: "estimate" as const,
    icon: "⏱️",
    name: "评估工期与修复方案",
    desc: "/estimate",
    keywords: ["estimate", "评估", "工期", "修复", "方案", "pg", "gq", "xf"]
  }
]

export function App() {
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [command, setCommand] = useState<ChatCommand>("estimate")
  const [agent, setAgent] = useState<"claude-code" | "codex">("claude-code")
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const [input, setInput] = useState("")

  const selectAgent = (a: "claude-code" | "codex") => {
    setAgent(a)
    setAgentMenuOpen(false)
  }
  const [copiedStatus, setCopiedStatus] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { workspaces, messages, sending, statusText, send, addWorkspace } = useChatSession()

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
    if (!query) return ALL_SLASH_COMMANDS
    return ALL_SLASH_COMMANDS.filter(cmd => 
      cmd.desc.toLowerCase().includes(query) ||
      cmd.name.toLowerCase().includes(query) ||
      cmd.keywords.some(kw => kw.includes(query))
    )
  }

  const filteredCommands = getFilteredCommands()
  const showSlashMenu = input.startsWith("/") && filteredCommands.length > 0

  const selectSlashCommand = (cmd: ChatCommand) => {
    setCommand(cmd)
    setInput(COMMAND_PRESETS[cmd])
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
        <WorkspaceSwitcher
          value={workspaceId}
          onChange={handleWorkspaceChange}
          workspaces={workspaces}
          onAddWorkspace={addWorkspace}
        />
      </header>

      <div className="app-body">
        <ChatThread
          messages={messages}
          onSelectSkill={(cmd) => {
            setCommand(cmd)
            setInput(COMMAND_PRESETS[cmd])
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
            <button
              type="button"
              className="quick-skill-pill estimate"
              onClick={() => selectSlashCommand("estimate")}
            >
              ⏱️ 评估
            </button>
          </div>
        )}

        <div className="input-card">
          {showSlashMenu && (
            <div className="slash-menu-modern">
              <div className="slash-menu-header">快捷技能 (点击选择)</div>
              {filteredCommands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="slash-menu-item"
                  onClick={() => selectSlashCommand(cmd.id)}
                >
                  <span className="item-icon">{cmd.icon}</span>
                  <span className="item-name">{cmd.name}</span>
                  <span className="item-desc">{cmd.desc}</span>
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
