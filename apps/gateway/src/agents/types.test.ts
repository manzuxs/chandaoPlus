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

  it("points agents to persisted conversation history instead of inlining messages", () => {
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

    expect(prompt).toContain("/tmp/bundle/conversation.md")
    expect(prompt).not.toContain("<conversation_history>")
    expect(prompt).not.toContain("这是什么bug？")
    expect(prompt).not.toContain("这是一个空指针异常")
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

  it("includes must_read_files section when requiredFiles are provided", () => {
    const fs = require("node:fs")
    const path = require("node:path")
    
    const wsRoot = path.join(__dirname, "../../../../temp_test_ws_dir_" + Date.now())
    if (!fs.existsSync(wsRoot)) {
      fs.mkdirSync(wsRoot, { recursive: true })
    }
    
    const ruleFileRel = "GUIDELINES.md"
    const ruleFileAbs = path.join(wsRoot, ruleFileRel)
    fs.writeFileSync(ruleFileAbs, "Code must be neat.", "utf8")

    try {
      const prompt = buildPrompt({
        command: "default",
        workspaceRoot: wsRoot,
        bundleDir: "/tmp/bundle",
        messages: [{ role: "user", content: "开发一个新功能" }],
        requiredFiles: [ruleFileRel, "NON_EXISTENT.txt"]
      })

      expect(prompt).toContain("<must_read_files>")
      expect(prompt).toContain("<file path=\"GUIDELINES.md\">")
      expect(prompt).toContain("Code must be neat.")
      expect(prompt).toContain("<file path=\"NON_EXISTENT.txt\" status=\"error\">")
    } finally {
      try {
        fs.unlinkSync(ruleFileAbs)
        fs.rmdirSync(wsRoot)
      } catch (e) {}
    }
  })
})
