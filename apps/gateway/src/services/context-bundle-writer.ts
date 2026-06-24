import { mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import type { ChatMessage, PageCapture } from "@chandaoplus/shared"
import { CONVERSATION_MAX_MESSAGES, CONVERSATION_MAX_MESSAGE_CHARS } from "../config"

function extractCodeBlocks(content: string): string[] {
  const blocks: string[] = []
  const regex = /```[\s\S]*?```/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[0])
  }
  return blocks
}

function truncateMessage(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  return `${content.slice(0, maxChars)}\n\n[已截断，原消息过长]`
}

function roleLabel(role: string): string {
  return role === "user" ? "User" : role === "assistant" ? "Assistant" : "System"
}

function formatConversationHistory(messages: ChatMessage[] = [], summary?: string): string {
  if (messages.length === 0) {
    if (summary) {
      return `# 会话摘要\n\n${summary}\n\n# 会话历史\n\n暂无历史会话消息。`
    }
    return "# 会话历史\n\n暂无历史会话消息。"
  }

  const sections: string[] = []

  // Section 1: Summary (Layer 3)
  if (summary) {
    sections.push(`# 会话摘要\n\n${summary}`)
  }

  const recentCount = CONVERSATION_MAX_MESSAGES
  const needsWindowing = messages.length > recentCount

  if (!needsWindowing) {
    // All messages fit in the window — output them all
    const messageSections = messages.map((msg, i) =>
      `## ${i + 1}. ${roleLabel(msg.role)}\n\n${truncateMessage(msg.content, CONVERSATION_MAX_MESSAGE_CHARS)}`
    )
    sections.push("# 会话历史\n\n" + messageSections.join("\n\n"))
    return sections.join("\n\n")
  }

  // Structured window mode
  const recentMessages = messages.slice(-recentCount)
  const earlierMessages = messages.slice(0, -recentCount)

  // Section 2: Original task — first user message
  const firstUserMsg = messages.find((m) => m.role === "user")
  const firstUserInRecent = firstUserMsg && recentMessages.includes(firstUserMsg)

  if (firstUserMsg && !firstUserInRecent) {
    sections.push(`# 原始任务\n\n${truncateMessage(firstUserMsg.content, CONVERSATION_MAX_MESSAGE_CHARS)}`)
  }

  // Section 3: Code excerpts from middle messages (not in recent window, not the first user message)
  const codeExcerptMessages = earlierMessages.filter(
    (m) => m !== firstUserMsg
  )
  const allCodeBlocks: string[] = []
  for (const msg of codeExcerptMessages) {
    const blocks = extractCodeBlocks(msg.content)
    // Limit each code block to 3000 chars to avoid oversized sections
    for (const block of blocks) {
      allCodeBlocks.push(block.length > 3000 ? block.slice(0, 3000) + "\n\n[代码块已截断]" : block)
    }
  }

  if (allCodeBlocks.length > 0) {
    // Deduplicate while preserving order
    const seen = new Set<string>()
    const uniqueBlocks = allCodeBlocks.filter((b) => {
      const normalized = b.slice(0, 200).trim()
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    sections.push(`# 关键代码片段\n\n${uniqueBlocks.join("\n\n---\n\n")}`)
  }

  // Section 4: Recent messages
  const recentSections = recentMessages.map((msg, i) =>
    `## ${i + 1}. ${roleLabel(msg.role)}\n\n${truncateMessage(msg.content, CONVERSATION_MAX_MESSAGE_CHARS)}`
  )
  sections.push("# 最近对话\n\n" + recentSections.join("\n\n"))

  return sections.join("\n\n")
}

export async function writeContextBundle(
  workspaceRoot: string,
  sessionId: string,
  page: PageCapture,
  conversationMessages: ChatMessage[] = [],
  summary?: string
): Promise<string> {
  const bundleDir = join(workspaceRoot, ".chandaoplus", "sessions", sessionId)
  await rm(join(bundleDir, "images"), { recursive: true, force: true })
  await mkdir(join(bundleDir, "images"), { recursive: true })
  await writeFile(join(bundleDir, "page.md"), page.markdown, "utf8")
  await writeFile(join(bundleDir, "conversation.md"), formatConversationHistory(conversationMessages, summary), "utf8")
  await writeFile(
    join(bundleDir, "metadata.json"),
    JSON.stringify(
      {
        url: page.url,
        title: page.title,
        metadata: page.metadata,
        images: page.images.map((img) => ({
          filename: img.filename,
          alt: img.alt,
          sourceUrl: img.sourceUrl
        }))
      },
      null,
      2
    ),
    "utf8"
  )
  await Promise.all(
    page.images.map((image) =>
      writeFile(join(bundleDir, "images", image.filename), Buffer.from(image.base64Data, "base64"))
    )
  )
  return bundleDir
}

export { formatConversationHistory, extractCodeBlocks }
