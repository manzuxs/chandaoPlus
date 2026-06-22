import React, { useEffect, useRef, useState } from "react"
import type { ChatMessage, SessionListItem, Skill } from "@chandaoplus/shared"
import { marked } from "marked"

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
  sending?: boolean
}

function renderMarkdown(md: string): string {
  if (!md) return ""

  let escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\\|/g, "&#124;")
    .replace(/\|\|/g, "&#124;&#124;")

  // 预处理：保护反单引号代码块内的竖线，防止 marked 表格解析器将其误判为分列符
  escaped = escaped.replace(/`([^`\n]+)`/g, (match, code) => {
    return "`" + code.replace(/\|/g, "&#124;") + "`"
  })

  // 同步使用 marked 解析 Markdown
  let html = marked.parse(escaped, { async: false, breaks: true }) as string

  // 配合 UI 规范样式，用 table-wrapper 包裹 table，确保圆角与 border-hairline 正确应用
  html = html
    .replace(/<table>/g, '<div class="table-wrapper"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/&amp;#124;/g, "|")
    .replace(/&#124;/g, "|")

  return html
}

function CopyButton({ text, label }: { text: string; label?: string }) {
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
      title={copied ? "已复制" : `复制${label || ""}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {label && <span className="btn-copy-label">{copied ? "已复制" : label}</span>}
    </button>
  )
}

function CopyHtmlButton({ markdown, label }: { markdown: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      // Generate HTML and strip UI-only wrappers (e.g. table-wrapper div)
      let html = renderMarkdown(markdown)
        .replace(/<div class="table-wrapper">/g, "")
        .replace(/<\/div>(<\/table>)/g, "$1") // stray </div> after </table>

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([markdown], { type: "text/plain" }),
        }),
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // Fallback: copy raw HTML string as plain text
      try {
        await navigator.clipboard.writeText(renderMarkdown(markdown))
      } catch { /* ignore */ }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      className={`btn-copy ${copied ? "copied" : ""}`}
      onClick={handleCopy}
      type="button"
      title={copied ? "已复制" : `复制${label}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span className="btn-copy-label">{copied ? "已复制" : label}</span>
    </button>
  )
}

export function ChatThread({ messages, skills = [], onSelectSkill, sending = false }: ChatThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="chat-thread" ref={containerRef}>
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
              <button
                key={skill.id}
                type="button"
                className="skill-chip"
                onClick={() => onSelectSkill?.(skill)}
              >
                {skill.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((msg, index) => {
          const isGenerating = sending && msg.role === "assistant" && index === messages.length - 1
          const isThinking = isGenerating && !msg.content

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
                  <div className={`message-bubble ${msg.role} ${isGenerating ? "generating" : ""}`}>
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
                      <CopyButton text={msg.content} label="MD" />
                      <CopyHtmlButton markdown={msg.content} label="HTML" />
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
