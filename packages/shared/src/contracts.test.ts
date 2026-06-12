import { describe, expect, it } from "vitest"
import { ChatCommandSchema, ChatRequestSchema, WorkspaceProfileSchema } from "./contracts"

describe("contracts", () => {
  it("accepts an estimate request", () => {
    const workspace = WorkspaceProfileSchema.parse({
      id: "proj-a",
      label: "A项目",
      rootPath: "/tmp/project-a",
      defaultAgent: "claude-code"
    })

    const request = ChatRequestSchema.parse({
      workspaceId: workspace.id,
      agent: workspace.defaultAgent,
      command: "estimate",
      page: {
        url: "https://zentao.local/bug-view-123.html",
        title: "BUG #123",
        markdown: "# BUG #123",
        images: [{ filename: "bug-1.png", alt: "报错截图", mimeType: "image/png", sourceUrl: "https://zentao.local/file-read-1.png", base64Data: "ZmFrZQ==" }],
        metadata: { pageKind: "zentao-bug-detail", bugId: "123" }
      },
      messages: [{ role: "user", content: "请评估修复工期" }]
    })

    expect(request.command).toBe("estimate")
    expect(request.page.images).toHaveLength(1)
  })

  it("rejects legacy commands", () => {
    expect(() => ChatCommandSchema.parse("ask")).toThrow()
    expect(() => ChatCommandSchema.parse("repair")).toThrow()
  })
})
