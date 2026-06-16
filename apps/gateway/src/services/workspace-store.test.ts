import { mkdtemp, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"
import { WorkspaceStore } from "./workspace-store"
import { writeContextBundle } from "./context-bundle-writer"

describe("WorkspaceStore", () => {
  it("persists workspace profiles and writes bundles inside the project", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "chandaoplus-"))
    const workspaceRoot = join(baseDir, "project-a")
    const store = new WorkspaceStore(join(baseDir, "workspaces.json"))

    await store.save({ id: "project-a", label: "A项目", rootPath: workspaceRoot, defaultAgent: "codex" })
    const workspaces = await store.list()
    const bundleDir = await writeContextBundle(workspaceRoot, "session-1", {
      url: "https://zentao.local/bug-view-1.html",
      title: "BUG #1",
      markdown: "# BUG #1",
      images: [],
      metadata: {}
    })

    expect(workspaces[0]?.rootPath).toBe(workspaceRoot)
    expect(bundleDir).toContain(".chandaoplus/sessions/session-1")
    expect(await readFile(join(bundleDir, "page.md"), "utf8")).toContain("# BUG #1")
    expect(await readFile(join(bundleDir, "conversation.md"), "utf8")).toContain("暂无历史会话消息")
  })

  it("writes recent conversation history into the context bundle", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "chandaoplus-"))
    const workspaceRoot = join(baseDir, "project-a")

    const bundleDir = await writeContextBundle(
      workspaceRoot,
      "session-2",
      {
        url: "https://zentao.local/bug-view-2.html",
        title: "BUG #2",
        markdown: "# BUG #2",
        images: [],
        metadata: {}
      },
      [
        { role: "user", content: "之前请 Claude Code 分析过登录问题" },
        { role: "assistant", content: "结论是 token 过期处理异常" }
      ]
    )

    const conversation = await readFile(join(bundleDir, "conversation.md"), "utf8")
    expect(conversation).toContain("# 会话历史")
    expect(conversation).toContain("## 1. User")
    expect(conversation).toContain("之前请 Claude Code 分析过登录问题")
    expect(conversation).toContain("## 2. Assistant")
    expect(conversation).toContain("结论是 token 过期处理异常")
  })
})
