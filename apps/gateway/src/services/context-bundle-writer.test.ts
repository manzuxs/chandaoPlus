import { describe, expect, it } from "vitest"
import type { ChatMessage } from "@chandaoplus/shared"
import { extractCodeBlocks, formatConversationHistory } from "./context-bundle-writer"

describe("extractCodeBlocks", () => {
  it("extracts a single fenced code block", () => {
    const blocks = extractCodeBlocks("Some text\n```\nconst x = 1\n```\nMore text")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toBe("```\nconst x = 1\n```")
  })

  it("extracts multiple code blocks", () => {
    const content = "```ts\nconst a = 1\n```\n\n```ts\nconst b = 2\n```"
    const blocks = extractCodeBlocks(content)
    expect(blocks).toHaveLength(2)
  })

  it("extracts code blocks with language specifiers", () => {
    const blocks = extractCodeBlocks("```typescript\ninterface Foo {}\n```")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toBe("```typescript\ninterface Foo {}\n```")
  })

  it("returns empty array when no code blocks present", () => {
    const blocks = extractCodeBlocks("Just plain text, no code here.")
    expect(blocks).toEqual([])
  })

  it("handles nested backticks correctly", () => {
    const content = "```md\n# Title\n```\n"
    const blocks = extractCodeBlocks(content)
    expect(blocks).toHaveLength(1)
  })
})

describe("formatConversationHistory", () => {
  it("returns placeholder for empty messages", () => {
    const result = formatConversationHistory([])
    expect(result).toContain("# 会话历史")
    expect(result).toContain("暂无历史会话消息")
  })

  it("formats a small number of messages in flat mode", () => {
    const messages = [
      { role: "user" as const, content: "请分析登录问题" },
      { role: "assistant" as const, content: "token 过期处理异常" },
    ]
    const result = formatConversationHistory(messages)
    expect(result).toContain("# 会话历史")
    expect(result).toContain("## 1. User")
    expect(result).toContain("请分析登录问题")
    expect(result).toContain("## 2. Assistant")
    expect(result).toContain("token 过期处理异常")
    expect(result).not.toContain("原始任务")
    expect(result).not.toContain("关键代码片段")
  })

  it("includes summary section when summary is provided", () => {
    const result = formatConversationHistory(
      [{ role: "user" as const, content: "Hello" }],
      "这是摘要内容"
    )
    expect(result).toContain("# 会话摘要")
    expect(result).toContain("这是摘要内容")
  })

  it("truncates long messages", () => {
    const longContent = "x".repeat(20000)
    const messages = [{ role: "user" as const, content: longContent }]
    const result = formatConversationHistory(messages)
    expect(result).toContain("[已截断，原消息过长]")
    expect(result.length).toBeLessThan(longContent.length)
  })

  it("preserves first user message as original task in structured window mode", () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 === 0 ? "user" as const : "assistant" as const,
      content: `Message ${i} content here.`
    }))

    const result = formatConversationHistory(messages)
    expect(result).toContain("# 原始任务")
    expect(result).toContain("Message 0 content here.")
    expect(result).toContain("# 最近对话")
  })

  it("extracts code blocks from middle messages in structured window mode", () => {
    const messages: ChatMessage[] = Array.from({ length: 55 }, (_, i) => ({
      role: "user" as const,
      content: `Message ${i}`
    }))
    // Insert code blocks in the earliest messages (indices 0-4 are middle section with window=50)
    messages[1] = {
      role: "assistant",
      content: "Here is the fix:\n```ts\nconst fixed = true\n```\nAnd more text."
    }
    messages[3] = {
      role: "assistant",
      content: "Another change:\n```json\n{ \"key\": \"value\" }\n```"
    }

    const result = formatConversationHistory(messages)
    expect(result).toContain("# 关键代码片段")
    expect(result).toContain("```ts\nconst fixed = true\n```")
    expect(result).toContain("```json\n{ \"key\": \"value\" }\n```")
  })

  it("deduplicates identical code blocks in excerpt section", () => {
    const sameBlock = "```ts\nconst x = 1\n```"
    const uniqueBlock = "```ts\nconst y = 2\n```"
    const messages: ChatMessage[] = Array.from({ length: 55 }, (_, i) => ({
      role: "assistant" as const,
      content: `Message ${i}`
    }))
    // Only put code blocks in earlier messages (indices 0-4), not recent ones
    messages[0] = { role: "assistant", content: `${sameBlock}\n${uniqueBlock}` }
    messages[2] = { role: "assistant", content: `${sameBlock}\nmore text` }

    const result = formatConversationHistory(messages)
    // sameBlock appears in both excerpts, should be deduped to one copy in excerpt section
    const excerptStart = result.indexOf("# 关键代码片段")
    const excerptEnd = result.indexOf("# 最近对话")
    const excerptSection = result.slice(excerptStart, excerptEnd)
    const firstInExcerpt = excerptSection.indexOf(sameBlock)
    const lastInExcerpt = excerptSection.lastIndexOf(sameBlock)
    expect(firstInExcerpt).toBe(lastInExcerpt)
    expect(firstInExcerpt).toBeGreaterThan(-1)
  })

  it("does not include code excerpts section when no code blocks in middle", () => {
    const messages = Array.from({ length: 55 }, (_, i) => ({
      role: "user" as const,
      content: `Plain message ${i} with no code blocks.`
    }))

    const result = formatConversationHistory(messages)
    expect(result).not.toContain("# 关键代码片段")
  })

  it("includes both summary and structured sections together", () => {
    const messages = Array.from({ length: 55 }, (_, i) => ({
      role: i % 2 === 0 ? "user" as const : "assistant" as const,
      content: `Message ${i}`
    }))
    messages[3] = {
      role: "assistant" as const,
      content: "```ts\nconst fix = true\n```"
    }

    const result = formatConversationHistory(messages, "完整的会话摘要")
    expect(result).toContain("# 会话摘要")
    expect(result).toContain("完整的会话摘要")
    expect(result).toContain("# 原始任务")
    expect(result).toContain("# 关键代码片段")
    expect(result).toContain("# 最近对话")
  })

  it("does not duplicate first user message in original task if already in recent window", () => {
    // Only 10 messages — all fit in recent window
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: "user" as const,
      content: `Message ${i}`
    }))

    const result = formatConversationHistory(messages)
    expect(result).not.toContain("# 原始任务")
    expect(result).not.toContain("# 关键代码片段")
    expect(result).toContain("# 会话历史")
  })

  it("includes summary even when messages are empty", () => {
    const result = formatConversationHistory([], "已有的摘要")
    expect(result).toContain("# 会话摘要")
    expect(result).toContain("已有的摘要")
    expect(result).toContain("暂无历史会话消息")
  })

  it("treats 50 messages as flat mode (exact boundary)", () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      role: "user" as const,
      content: `Message ${i}`
    }))
    const result = formatConversationHistory(messages)
    expect(result).toContain("# 会话历史")
    expect(result).not.toContain("# 原始任务")
    expect(result).not.toContain("# 关键代码片段")
  })

  it("triggers structured window at 51 messages", () => {
    const messages = Array.from({ length: 51 }, (_, i) => ({
      role: "user" as const,
      content: `Message ${i}`
    }))
    const result = formatConversationHistory(messages)
    expect(result).toContain("# 原始任务")
    expect(result).toContain("# 最近对话")
  })

  it("handles system role messages correctly", () => {
    const messages: ChatMessage[] = Array.from({ length: 55 }, (_, i) => ({
      role: "system",
      content: `System ${i}`
    }))
    messages[0] = { role: "user", content: "第一个用户消息" }

    const result = formatConversationHistory(messages)
    expect(result).toContain("# 原始任务")
    expect(result).toContain("第一个用户消息")
  })

  it("truncates code blocks over 3000 characters in excerpt section", () => {
    const longCode = "```ts\n" + "// " + "x".repeat(3500) + "\n```"
    const messages = Array.from({ length: 55 }, (_, i) => ({
      role: "user" as const,
      content: i === 2 ? longCode : `Message ${i}`
    }))

    const result = formatConversationHistory(messages)
    expect(result).toContain("[代码块已截断]")
  })
})
