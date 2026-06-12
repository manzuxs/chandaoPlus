import React, { useEffect, useRef, useState } from "react"
import type { ChatMessage, Skill } from "@chandaoplus/shared"

interface ChatThreadProps {
  messages: ChatMessage[]
  skills?: Skill[]
  onSelectSkill?: (skill: Skill) => void
}

const UserAvatar = () => (
  <svg className="avatar-icon user" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
)

const AiAvatar = () => (
  <svg className="avatar-icon assistant" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096L5 14m4 7L5 14m8.813-5.096L15 3m0 0l.813 5.096L19 10m-4-7L19 10M9.813 8.096L9 3m0 0L8.187 8.096L5 10m4-7L5 10m8.813 7.904L15 21m0 0l.813-5.096L19 14m-4 7L19 14" />
  </svg>
)

const SystemAvatar = () => (
  <svg className="avatar-icon system" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

function renderMarkdown(md: string): string {
  if (!md) return ""

  // 1. Escape HTML to prevent XSS
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // 2. Parse code blocks
  html = html.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, code) => {
    return `<pre><code>${code}</code></pre>`
  })

  // 3. Parse inline code
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>")

  // 4. Parse bold text
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")

  // 5. Parse headers
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>")
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>")
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>")

  // 6. Parse lists and tables line-by-line
  const lines = html.split("\n")
  let inTable = false
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Unordered lists
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

    // Markdown tables
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
  }

  html = lines.join("\n")
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
    <button className="btn-copy" onClick={handleCopy} type="button">
      {copied ? "已复制 ✔" : "复制"}
    </button>
  )
}

export function ChatThread({ messages, skills = [], onSelectSkill }: ChatThreadProps) {
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
            <h4 className="welcome-title">您好，我是 chandaoPlus</h4>
            <p className="welcome-subtitle">
              请点击下方"技能"卡片或输入"/"以快速执行任务：
            </p>
          </div>

          <div className="skills-grid">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className={`skill-chip ${skill.id}`}
                onClick={() => onSelectSkill?.(skill)}
                role="button"
                tabIndex={0}
              >
                {skill.icon} {skill.name}
              </div>
            ))}
          </div>
        </div>
      ) : (
        messages.map((msg, index) => {
          // If assistant content is empty (stream initializing), render skeleton loading
          const isThinking = msg.role === "assistant" && !msg.content

          return (
            <div key={index} className={`message-row ${msg.role}`}>
              <div className="avatar-wrapper">
                {msg.role === "user" ? <UserAvatar /> : msg.role === "system" ? <SystemAvatar /> : <AiAvatar />}
              </div>

              {isThinking ? (
                <div className="message-bubble assistant thinking">
                  <div className="thinking-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div className="thinking-text">AI 正在思考中...</div>
                </div>
              ) : (
                <div className={`message-bubble ${msg.role}`}>
                  {msg.role === "assistant" ? (
                    <>
                      <div
                        className="message-content"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                      <CopyButton text={msg.content} />
                    </>
                  ) : (
                    <div className="message-content">{msg.content}</div>
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
