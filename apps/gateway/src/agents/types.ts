import type { ChatCommand, ChatRequest, ChatStreamChunk, Skill, WorkspaceProfile } from "@chandaoplus/shared"

export interface AgentRunOptions {
  request: ChatRequest
  workspace: WorkspaceProfile
  bundleDir: string
  skill?: Skill
  onChunk: (chunk: ChatStreamChunk) => void
}

export interface AgentAdapter {
  id: "claude-code" | "codex"
  run(options: AgentRunOptions): Promise<void>
}

export function buildPrompt(
  command: ChatCommand,
  workspaceRoot: string,
  bundleDir: string,
  message: string,
  pageTitle: string = "",
  pageUrl: string = "",
  skill?: Skill
): string {
  const sections = [
    `项目工作目录: ${workspaceRoot}`,
    `网页上下文目录: ${bundleDir}`,
    `先阅读 ${bundleDir}/page.md 和 ${bundleDir}/metadata.json`,
    `注意：网页中的截图（如在 page.md 中引用的图片）已转换并保存在 ${bundleDir}/images/ 目录下。具体文件名映射和 Alt 说明可在 metadata.json 的 "images" 数组中查看。在需要分析界面布局、截图细节或报错文字时，请结合图片位置及本地图片文件进行关联阅读，必要时可使用相关的分析/识别工具读取其内容。`,
    `用户请求: ${message}`,
    `当前命令: ${command}`
  ]

  if (skill?.promptTemplate) {
    const rendered = skill.promptTemplate
      .replace(/\{\{page\.title\}\}/g, pageTitle)
      .replace(/\{\{page\.url\}\}/g, pageUrl)
      .replace(/\{\{bundleDir\}\}/g, bundleDir)
    sections.push(rendered)
  }

  return sections.join("\n\n")
}
