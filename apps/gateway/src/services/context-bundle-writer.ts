import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ChatMessage, PageCapture } from "@chandaoplus/shared"

const MAX_CONVERSATION_MESSAGES = 12
const MAX_MESSAGE_CHARS = 4000

function formatConversationHistory(messages: ChatMessage[] = []): string {
  const recentMessages = messages.slice(-MAX_CONVERSATION_MESSAGES)
  if (recentMessages.length === 0) {
    return "# 会话历史\n\n暂无历史会话消息。"
  }

  const sections = recentMessages.map((message, index) => {
    const role = message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : "System"
    const content = message.content.length > MAX_MESSAGE_CHARS
      ? `${message.content.slice(0, MAX_MESSAGE_CHARS)}\n\n[已截断，原消息过长]`
      : message.content
    return `## ${index + 1}. ${role}\n\n${content}`
  })

  return ["# 会话历史", ...sections].join("\n\n")
}

export async function writeContextBundle(
  workspaceRoot: string,
  sessionId: string,
  page: PageCapture,
  conversationMessages: ChatMessage[] = []
): Promise<string> {
  const bundleDir = join(workspaceRoot, ".chandaoplus", "sessions", sessionId)
  await mkdir(join(bundleDir, "images"), { recursive: true })
  await writeFile(join(bundleDir, "page.md"), page.markdown, "utf8")
  await writeFile(join(bundleDir, "conversation.md"), formatConversationHistory(conversationMessages), "utf8")
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
