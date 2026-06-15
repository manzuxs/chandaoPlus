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

    expect(prompt).toContain("<command>estimate</command>")
    expect(prompt).toContain("<skill_instruction>")
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

    expect(prompt).toContain("<conversation_history>")
    expect(prompt).toContain('<message role="user">这是什么bug？</message>')
    expect(prompt).toContain('<message role="assistant">这是一个空指针异常</message>')
    expect(prompt).toContain("<current_task>")
    expect(prompt).toContain("<user_request>如何修复？</user_request>")
  })

  it("skips history section when only one message", () => {
    const prompt = buildPrompt({
      command: "default",
      workspaceRoot: "/ws",
      bundleDir: "/tmp/bundle",
      messages: [{ role: "user", content: "hello" }],
    })

    expect(prompt).not.toContain("<conversation_history>")
    expect(prompt).toContain("<user_request>hello</user_request>")
  })

  it("includes XML context when page object is provided", () => {
    const prompt = buildPrompt({
      command: "default",
      workspaceRoot: "/ws",
      bundleDir: "/tmp/bundle",
      messages: [{ role: "user", content: "评估" }],
      page: {
        url: "https://example.com/bug/123",
        title: "页面加载缓慢",
        markdown: "# 详情\n\n系统在特定网络下非常慢。",
        images: [
          {
            filename: "image-1.png",
            alt: "截图",
            mimeType: "image/png",
            sourceUrl: "https://example.com/img.png",
            base64Data: "abc",
          },
        ],
        metadata: {
          bugId: "123",
          status: "active",
        },
      },
    })

    expect(prompt).toContain("<page_context>")
    expect(prompt).toContain("<url>https://example.com/bug/123</url>")
    expect(prompt).toContain("<title>页面加载缓慢</title>")
    expect(prompt).toContain("<bugId>123</bugId>")
    expect(prompt).toContain("<status>active</status>")
    expect(prompt).toContain("<filename>image-1.png</filename>")
    expect(prompt).toContain("<localPath>/tmp/bundle/images/image-1.png</localPath>")
    expect(prompt).toContain("<page_content_markdown>")
    expect(prompt).toContain("# 详情")
  })
})
