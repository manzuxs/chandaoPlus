import { describe, expect, it } from "vitest"
import { buildPrompt } from "./types"

const estimateSkill = {
  id: "estimate",
  name: "评估工期",
  icon: "",
  description: "",
  keywords: [],
  promptTemplate: [
    "请严格按以下 Markdown 结构输出，不要增删一级标题：",
    "## 问题摘要",
    "- 用 1 句话总结问题本质。",
    "",
    "## 修复方案",
    "## 验证清单",
  ].join("\n"),
  outputFormat: "markdown" as const,
  builtin: true,
}

describe("buildPrompt", () => {
  it("includes the structured estimate template", () => {
    const prompt = buildPrompt({
      command: "estimate",
      workspaceRoot: "/workspace/project",
      bundleDir: "/tmp/bundle",
      messages: [{ role: "user", content: "登录页白屏，帮我评估" }],
      skill: estimateSkill,
    })

    expect(prompt).toContain("当前命令: estimate")
    expect(prompt).toContain("请严格按以下 Markdown 结构输出")
    expect(prompt).toContain("## 问题摘要")
    expect(prompt).toContain("## 修复方案")
    expect(prompt).toContain("## 验证清单")
  })

  it("includes conversation history when multiple messages", () => {
    const prompt = buildPrompt({
      command: "default",
      workspaceRoot: "/ws",
      bundleDir: "/tmp/bundle",
      messages: [
        { role: "user", content: "这是什么bug？" },
        { role: "assistant", content: "这是一个空指针异常" },
        { role: "user", content: "如何修复？" },
      ],
    })

    expect(prompt).toContain("## 对话历史")
    expect(prompt).toContain("**User:** 这是什么bug？")
    expect(prompt).toContain("**Assistant:** 这是一个空指针异常")
    expect(prompt).toContain("## 当前任务")
    expect(prompt).toContain("如何修复？")
  })

  it("skips history section when only one message", () => {
    const prompt = buildPrompt({
      command: "default",
      workspaceRoot: "/ws",
      bundleDir: "/tmp/bundle",
      messages: [{ role: "user", content: "hello" }],
    })

    expect(prompt).not.toContain("## 对话历史")
    expect(prompt).toContain("用户请求: hello")
  })
})
