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
  })
})
