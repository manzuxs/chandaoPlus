import type { ChatMessage, ChatRequest, ChatStreamChunk, PageCapture, Skill, WorkspaceProfile } from "@chandaoplus/shared"
import { escapeXml, formatPageCaptureToXml } from "@chandaoplus/shared"

export interface AgentRunOptions {
  request: ChatRequest
  workspace: WorkspaceProfile
  bundleDir: string
  skill?: Skill
  onChunk: (chunk: ChatStreamChunk) => void
  sessionStore: any
  signal?: AbortSignal
}

export interface AgentAdapter {
  id: "claude-code" | "codex" | "opencode"
  run(options: AgentRunOptions): Promise<void>
}

export function buildPrompt(params: {
  command: string
  workspaceRoot: string
  bundleDir: string
  messages: ChatMessage[]
  pageTitle?: string
  pageUrl?: string
  skill?: Skill
  page?: PageCapture
}): string {
  const { command, workspaceRoot, bundleDir, messages, pageTitle = "", pageUrl = "", skill, page } = params

  // 1. Session Context
  const pageContextXml = page ? `\n${formatPageCaptureToXml(page, bundleDir)}` : ""
  const sessionContext = `<session_context>
  <workspace_root>${workspaceRoot}</workspace_root>
  <bundle_dir>${bundleDir}</bundle_dir>${pageContextXml}
</session_context>`

  // 2. Conversation History
  let conversationHistory = ""
  if (messages.length > 1) {
    const historyItems = messages
      .slice(0, -1)
      .map((m) => {
        const role = m.role === "user" ? "user" : "assistant"
        return `  <message role="${role}">${escapeXml(m.content)}</message>`
      })
      .join("\n")
    conversationHistory = `\n<conversation_history>\n${historyItems}\n</conversation_history>\n\n`
  }

  // 3. System Instructions
  let skillInstruction = ""
  if (skill?.promptTemplate) {
    const rendered = skill.promptTemplate
      .replace(/\{\{page\.title\}\}/g, pageTitle)
      .replace(/\{\{page\.url\}\}/g, pageUrl)
      .replace(/\{\{bundleDir\}\}/g, bundleDir)
    // 增加缩进以保持 XML 美观
    const indented = rendered.split("\n").map(line => line ? `    ${line}` : "").join("\n")
    skillInstruction = `\n  <skill_instruction>\n${indented}\n  </skill_instruction>`
  }

  const systemInstructions = `<system_instructions>
  <general_instruction>
    注意：网页中的截图（如在 page.md 或 XML 上下文中引用的图片）已转换并保存在 ${bundleDir}/images/ 目录下。具体文件名映射和 Alt 说明可在 metadata.json 的 "images" 数组中查看。在需要分析界面布局、截图细节或报错文字时，请结合图片位置及本地图片文件进行关联阅读，必要时可使用相关的分析/识别工具读取其内容。
    同时，你也应该优先阅读本地的 ${bundleDir}/page.md 以及 ${bundleDir}/metadata.json 文件以确认上下文细节。
  </general_instruction>${skillInstruction}
</system_instructions>`

  // 4. Current Task
  const lastMessage = messages.at(-1)?.content ?? command
  const currentTask = `<current_task>
  <command>${command}</command>
  <user_request>${escapeXml(lastMessage)}</user_request>
</current_task>`

  return `${sessionContext}\n\n${conversationHistory}${systemInstructions}\n\n${currentTask}`
}
