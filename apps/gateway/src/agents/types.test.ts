import { describe, expect, it } from "vitest"
import { buildPrompt } from "./types"

describe("buildPrompt", () => {
  it("includes the structured estimate template", () => {
    const prompt = buildPrompt(
      "estimate",
      "/workspace/project",
      "/tmp/bundle",
      "登录页白屏，帮我评估"
    )

    expect(prompt).toContain("当前命令: estimate")
    expect(prompt).toContain("请严格按以下 Markdown 结构输出")
    expect(prompt).toContain("## 问题摘要")
    expect(prompt).toContain("| 阶段 | 预估耗时 | 说明 |")
    expect(prompt).toContain("| 风险项 | 影响程度 | 缓解措施 |")
    expect(prompt).toContain("## 修复方案")
    expect(prompt).toContain("## 验证清单")
  })
})
