import { describe, expect, it } from "vitest"
import { buildSummarizationPrompt, generateFallbackSummary } from "./summarizer"

describe("buildSummarizationPrompt", () => {
  it("formats messages with Chinese role labels", () => {
    const messages = [
      { role: "user" as const, content: "请修复登录 bug" },
      { role: "assistant" as const, content: "已修复 auth.ts 中的 token 刷新逻辑" },
    ]
    const result = buildSummarizationPrompt(messages)
    expect(result).toContain("## 用户")
    expect(result).toContain("请修复登录 bug")
    expect(result).toContain("## 助手")
    expect(result).toContain("已修复 auth.ts 中的 token 刷新逻辑")
    expect(result).toContain("核心任务/目标")
    expect(result).toContain("重要决策")
  })

  it("truncates messages over 8000 characters", () => {
    const longContent = "x".repeat(10000)
    const messages = [{ role: "user" as const, content: longContent }]
    const result = buildSummarizationPrompt(messages)
    expect(result).toContain("[内容过长，已截断]")
    expect(result).not.toContain("x".repeat(9000))
  })

  it("includes incremental hint when previousSummary is provided", () => {
    const messages = [{ role: "user" as const, content: "Hello" }]
    const result = buildSummarizationPrompt(messages, "之前的摘要内容")
    expect(result).toContain("## 上一轮摘要")
    expect(result).toContain("之前的摘要内容")
    expect(result).toContain("请基于以上摘要和新消息，更新摘要内容")
  })

  it("does not include incremental hint without previousSummary", () => {
    const messages = [{ role: "user" as const, content: "Hello" }]
    const result = buildSummarizationPrompt(messages)
    expect(result).not.toContain("上一轮摘要")
  })

  it("handles system role messages", () => {
    const messages = [
      { role: "system" as const, content: "System instruction" },
      { role: "user" as const, content: "User message" },
    ]
    const result = buildSummarizationPrompt(messages)
    expect(result).toContain("## 系统")
    expect(result).toContain("System instruction")
  })
})

describe("generateFallbackSummary", () => {
  it("returns previous summary with auto-generated note when previousSummary exists", () => {
    const result = generateFallbackSummary([], "已有的摘要")
    expect(result).toContain("已有的摘要")
    expect(result).toContain("后续对话摘要由系统自动生成")
  })

  it("extracts first user message as task goal", () => {
    const messages = [
      { role: "system" as const, content: "system msg" },
      { role: "user" as const, content: "请修复登录页面的 500 错误，这个问题已经持续一周了" },
      { role: "assistant" as const, content: "我来分析" },
    ]
    const result = generateFallbackSummary(messages)
    expect(result).toContain("**核心任务**")
    expect(result).toContain("请修复登录页面的 500 错误")
  })

  it("truncates first user message to 200 characters", () => {
    const longTask = "请修复".padEnd(250, "X")
    const messages = [{ role: "user" as const, content: longTask }]
    const result = generateFallbackSummary(messages)
    expect(result).toContain(longTask.slice(0, 200))
    expect(result.length).toBeLessThan(longTask.length + 50)
  })

  it("counts code blocks in messages", () => {
    const messages = [
      { role: "assistant" as const, content: "```ts\nconst a = 1\n```\n\n```ts\nconst b = 2\n```" },
    ]
    const result = generateFallbackSummary(messages)
    expect(result).toContain("**涉及代码**：2 个代码片段")
  })

  it("extracts file paths from backtick references", () => {
    const messages = [
      { role: "assistant" as const, content: "修改了 `auth.ts` 和 `login.tsx` 文件" },
    ]
    const result = generateFallbackSummary(messages)
    expect(result).toContain("auth.ts")
    expect(result).toContain("login.tsx")
  })

  it("limits file paths to 10", () => {
    const files = Array.from({ length: 15 }, (_, i) => `file${i}.ts`)
    const messages = [
      { role: "assistant" as const, content: files.map((f) => `\`${f}\``).join(", ") },
    ]
    const result = generateFallbackSummary(messages)
    // Should only contain first 10
    const match = result.match(/file\d+\.ts/g)
    expect(match).not.toBeNull()
    expect(match!.length).toBeLessThanOrEqual(10)
  })

  it("handles messages with no code blocks or file paths", () => {
    const messages = [
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi there!" },
    ]
    const result = generateFallbackSummary(messages)
    expect(result).toContain("**消息总数**：2 条")
    expect(result).not.toContain("**涉及代码**")
    expect(result).not.toContain("**涉及文件**")
  })
})
