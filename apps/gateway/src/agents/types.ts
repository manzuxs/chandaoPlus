import type { ChatMessage, ChatRequest, ChatStreamChunk, Skill, WorkspaceProfile } from "@chandaoplus/shared"

export interface AgentRunOptions {
  request: ChatRequest
  workspace: WorkspaceProfile
  bundleDir: string
  skill?: Skill
  onChunk: (chunk: ChatStreamChunk) => void
  sessionStore: any
}

export interface AgentAdapter {
  id: "claude-code" | "codex"
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
}): string {
  const { command, workspaceRoot, bundleDir, messages, pageTitle = "", pageUrl = "", skill } = params

  const historySection =
    messages.length > 1
      ? messages
          .slice(0, -1)
          .map((m) => `**${m.role === "user" ? "User" : "Assistant"}:** ${m.content}`)
          .join("\n\n")
      : "";

  const lastMessage = messages.at(-1)?.content ?? command;

  let prompt = `项目工作目录: ${workspaceRoot}\n网页上下文目录: ${bundleDir}\n先阅读 ${bundleDir}/page.md 和 ${bundleDir}/metadata.json\n注意：网页中的截图（如在 page.md 中引用的图片）已转换并保存在 ${bundleDir}/images/ 目录下。具体文件名映射和 Alt 说明可在 metadata.json 的 "images" 数组中查看。在需要分析界面布局、截图细节或报错文字时，请结合图片位置及本地图片文件进行关联阅读，必要时可使用相关的分析/识别工具读取其内容。`;

  if (historySection) {
    prompt += `\n\n## 对话历史\n\n${historySection}\n\n---\n\n## 当前任务\n\n${lastMessage}`;
  } else {
    prompt += `\n\n用户请求: ${lastMessage}`;
  }

  prompt += `\n当前命令: ${command}`;

  if (skill?.promptTemplate) {
    const rendered = skill.promptTemplate
      .replace(/\{\{page\.title\}\}/g, pageTitle)
      .replace(/\{\{page\.url\}\}/g, pageUrl)
      .replace(/\{\{bundleDir\}\}/g, bundleDir)
    prompt += `\n\n${rendered}`;
  }

  return prompt;
}
