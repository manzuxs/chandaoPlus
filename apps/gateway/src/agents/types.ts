import type { ChatCommand, ChatRequest, ChatStreamChunk, WorkspaceProfile } from "@chandaoplus/shared"

export interface AgentRunOptions {
  request: ChatRequest
  workspace: WorkspaceProfile
  bundleDir: string
  onChunk: (chunk: ChatStreamChunk) => void
}

export interface AgentAdapter {
  id: "claude-code" | "codex"
  run(options: AgentRunOptions): Promise<void>
}

function buildEstimatePromptTemplate(): string {
  return [
    "你当前负责评估问题修复工期与修复方案。",
    "请严格按以下 Markdown 结构输出，不要增删一级标题：",
    "## 问题摘要",
    "- 用 1 句话总结问题本质。",
    "",
    "## 影响范围",
    "- 列出涉及的模块、页面、接口、数据或依赖。",
    "",
    "## 工期评估",
    "| 阶段 | 预估耗时 | 说明 |",
    "| --- | --- | --- |",
    "| 排查 |  |  |",
    "| 编码 |  |  |",
    "| 联调 |  |  |",
    "| 测试 |  |  |",
    "",
    "## 风险评估",
    "| 风险项 | 影响程度 | 缓解措施 |",
    "| --- | --- | --- |",
    "|  |  |  |",
    "",
    "## 修复方案",
    "1. 说明具体改动点。",
    "2. 标明涉及文件或模块。",
    "3. 写清每一步如何验证。",
    "",
    "## 验证清单",
    "- 列出自测项。",
    "- 列出需要回归验证的检查项。",
    "",
    "如果信息不足，请在对应项明确写出“待确认”及需要补充的信息。"
  ].join("\n")
}

export function buildPrompt(command: ChatCommand, workspaceRoot: string, bundleDir: string, message: string): string {
  const sections = [
    `项目工作目录: ${workspaceRoot}`,
    `网页上下文目录: ${bundleDir}`,
    `先阅读 ${bundleDir}/page.md 和 ${bundleDir}/metadata.json`,
    `注意：网页中的截图（如在 page.md 中引用的图片）已转换并保存在 ${bundleDir}/images/ 目录下。具体文件名映射和 Alt 说明可在 metadata.json 的 "images" 数组中查看。在需要分析界面布局、截图细节或报错文字时，请结合图片位置及本地图片文件进行关联阅读，必要时可使用相关的分析/识别工具读取其内容。`,
    `用户请求: ${message}`,
    `当前命令: ${command}`
  ]

  if (command === "estimate") {
    sections.push(buildEstimatePromptTemplate())
  }

  return sections.join("\n\n")
}
