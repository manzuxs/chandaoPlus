import React, { useEffect, useRef, useState } from "react"
import type { ChatMessage, SessionListItem, Skill } from "@chandaoplus/shared"

// SVG Icons
const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const AiIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
)

const SystemIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)

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

interface ChatThreadProps {
  messages: ChatMessage[]
  skills?: Skill[]
  onSelectSkill?: (skill: Skill) => void
  sessions?: SessionListItem[]
  activeSessionId?: string | null
  onSwitchSession?: (sessionId: string) => void
}

function renderMarkdown(md: string): string {
  if (!md) return ""

  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  html = html.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, code) => {
    return `<pre><code>${code}</code></pre>`
  })

  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>")
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>")
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>")
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>")
  html = html.replace(/^---$/gim, "<hr />")

  const lines = html.split("\n")
  let inTable = false
  let inList = false
  let inPre = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (lines[i].includes("<pre>")) {
      inPre = true
    }

    if (line === "---" || line === "<hr />") {
      lines[i] = "<hr />"
      if (inList) {
        inList = false
        lines[i] = "</ul><hr />"
      }
      if (inTable) {
        inTable = false
        lines[i] = "</tbody></table><hr />"
      }
      continue
    }

    if (!inPre) {
      if (line.startsWith("- ") || /^-\s/.test(line)) {
        const content = `<li>${line.replace(/^-\s+/, "")}</li>`
        if (!inList) {
          inList = true
          lines[i] = "<ul>" + content
        } else {
          lines[i] = content
        }
      } else {
        if (inList) {
          inList = false
          lines[i] = "</ul>" + lines[i]
        }
      }

      if (line.startsWith("|") && line.endsWith("|")) {
        const cells = line.split("|").slice(1, -1).map((c) => c.trim())
        if (!inTable) {
          inTable = true
          lines[i] = "<table><thead><tr>" + cells.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>"
        } else {
          if (cells.every((c) => /^:-*:$/.test(c) || /^-+$/.test(c))) {
            lines[i] = ""
          } else {
            lines[i] = "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>"
          }
        }
      } else {
        if (inTable) {
          inTable = false
          lines[i] = "</tbody></table>" + lines[i]
        }
      }

      if (!inList && !inTable && line !== "") {
        if (!/^(<h[1-6]>|<hr|<ul>|<table>|<pre>)/.test(line)) {
          lines[i] = `<p>${lines[i]}</p>`
        }
      }
    }

    if (lines[i].includes("</pre>")) {
      inPre = false
    }
  }

  let suffix = ""
  if (inList) suffix += "</ul>"
  if (inTable) suffix += "</tbody></table>"

  html = lines.join("\n") + suffix
  return html
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy text:", err)
    }
  }

  return (
    <button
      className={`btn-copy ${copied ? "copied" : ""}`}
      onClick={handleCopy}
      type="button"
      title={copied ? "已复制" : "复制"}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

export function ChatThread({ messages, skills = [], onSelectSkill, sessions, activeSessionId, onSwitchSession }: ChatThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="chat-thread" ref={containerRef}>
      {sessions && sessions.length > 1 && (
        <div className="session-selector">
          <select
            value={activeSessionId ?? ""}
            onChange={(e) => onSwitchSession?.(e.target.value)}
            className="session-select"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.id.slice(0, 8)} ({s.messageCount} 条消息)
              </option>
            ))}
          </select>
        </div>
      )}
      {messages.length === 0 ? (
        <div className="empty-thread">
          <div className="welcome-section">
            <h4 className="welcome-title">您好，我是chandaoPlus</h4>
            <p className="welcome-subtitle">
              选择技能或输入 "/" 开始对话
            </p>
          </div>

          <div className="skills-grid">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="skill-chip"
                onClick={() => onSelectSkill?.(skill)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSelectSkill?.(skill)
                  }
                }}
              >
                {skill.icon} {skill.name}
              </div>
            ))}
          </div>
        </div>
      ) : (
        messages.map((msg, index) => {
          const isThinking = msg.role === "assistant" && !msg.content

          return (
            <div key={index} className={`message-row ${msg.role}`}>
              <div className="avatar">
                {msg.role === "user" ? <UserIcon /> : msg.role === "system" ? <SystemIcon /> : <AiIcon />}
              </div>

              {isThinking ? (
                <div className="message-bubble assistant thinking">
                  <div className="thinking-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div className="thinking-text">思考中...</div>
                </div>
              ) : (
                <div className="message-block">
                  <div className={`message-bubble ${msg.role}`}>
                    {msg.role === "assistant" ? (
                      <div
                        className="message-content"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    ) : (
                      <div className="message-content">{msg.content}</div>
                    )}
                  </div>
                  {msg.role === "assistant" && (
                    <div className="message-actions">
                      <CopyButton text={msg.content} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
