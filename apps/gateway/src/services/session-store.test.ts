import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { SessionStore } from "./session-store"

describe("SessionStore", () => {
  let store: SessionStore
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "session-store-test-"))
    store = new SessionStore(join(tmpDir, "sessions.json"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("creates a session and returns it", async () => {
    const session = await store.create("ws-1")
    expect(session.id).toBeDefined()
    expect(session.workspaceId).toBe("ws-1")
    expect(session.messages).toEqual([])
    expect(session.createdAt).toBeDefined()
    expect(session.updatedAt).toBeDefined()
  })

  it("creates a session with a title", async () => {
    const session = await store.create("ws-1", "Bug 分析")
    expect(session.title).toBe("Bug 分析")
  })

  it("gets a session by id", async () => {
    const created = await store.create("ws-1")
    const found = await store.get(created.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(created.id)
  })

  it("returns undefined for non-existent session", async () => {
    const found = await store.get("non-existent-id")
    expect(found).toBeUndefined()
  })

  it("lists sessions for a workspace sorted by updatedAt desc", async () => {
    const s1 = await store.create("ws-1", "First")
    await new Promise((r) => setTimeout(r, 10))
    const s2 = await store.create("ws-1", "Second")
    const list = await store.listByWorkspace("ws-1")
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe(s2.id)
    expect(list[0].messageCount).toBe(0)
    expect(list[1].id).toBe(s1.id)
  })

  it("only returns sessions for the specified workspace", async () => {
    await store.create("ws-1")
    await store.create("ws-2")
    const list = await store.listByWorkspace("ws-1")
    expect(list).toHaveLength(1)
    expect(list[0].workspaceId).toBe("ws-1")
  })

  it("appends a message and updates updatedAt", async () => {
    const session = await store.create("ws-1")
    const before = session.updatedAt
    await new Promise((r) => setTimeout(r, 10))
    await store.appendMessage(session.id, { role: "user", content: "hello" })
    const updated = await store.get(session.id)
    expect(updated!.messages).toHaveLength(1)
    expect(updated!.messages[0].role).toBe("user")
    expect(updated!.messages[0].content).toBe("hello")
    expect(updated!.updatedAt).not.toBe(before)
  })

  it("throws when appending to non-existent session", async () => {
    await expect(
      store.appendMessage("bad-id", { role: "user", content: "hi" })
    ).rejects.toThrow("Session bad-id not found")
  })

  it("deletes a session", async () => {
    const session = await store.create("ws-1")
    await store.delete(session.id)
    const found = await store.get(session.id)
    expect(found).toBeUndefined()
  })

  it("throws when deleting non-existent session", async () => {
    await expect(store.delete("bad-id")).rejects.toThrow("Session bad-id not found")
  })

  it("persists data across store instances", async () => {
    const session = await store.create("ws-1")
    await store.appendMessage(session.id, { role: "user", content: "persist test" })
    const store2 = new SessionStore(join(tmpDir, "sessions.json"))
    const restored = await store2.get(session.id)
    expect(restored!.messages).toHaveLength(1)
    expect(restored!.messages[0].content).toBe("persist test")
  })

  it("updates, lists, and clears running task state", async () => {
    const session = await store.create("ws-1", "运行中会话")

    await store.updateRunningTask(session.id, "task-1", "running")
    const running = await store.get(session.id)
    expect(running!.runningTaskId).toBe("task-1")
    expect(running!.runningStatus).toBe("running")

    const list = await store.listByWorkspace("ws-1")
    expect(list[0].runningTaskId).toBe("task-1")
    expect(list[0].runningStatus).toBe("running")

    await store.clearRunningTask(session.id, "task-1")
    const cleared = await store.get(session.id)
    expect(cleared!.runningTaskId).toBeUndefined()
    expect(cleared!.runningStatus).toBeUndefined()
  })

  it("clears stale running task state by task id", async () => {
    const session = await store.create("ws-1", "运行中会话")
    await store.updateRunningTask(session.id, "stale-task", "running")

    await store.clearRunningTaskByTaskId("stale-task")

    const cleared = await store.get(session.id)
    expect(cleared!.runningTaskId).toBeUndefined()
    expect(cleared!.runningStatus).toBeUndefined()
  })

  it("updates summary on a session", async () => {
    const session = await store.create("ws-1", "摘要测试")
    await store.appendMessage(session.id, { role: "user", content: "测试消息" })

    await store.updateSummary(session.id, "核心任务：修复登录页。已修改 auth.ts。")

    const updated = await store.get(session.id)
    expect((updated as any).summary).toBe("核心任务：修复登录页。已修改 auth.ts。")
  })

  it("throws when updating summary for non-existent session", async () => {
    await expect(
      store.updateSummary("nonexistent-id", "summary")
    ).rejects.toThrow("Session nonexistent-id not found")
  })

  it("persists summary across store instances", async () => {
    const session = await store.create("ws-1", "持久化测试")
    await store.updateSummary(session.id, "跨实例摘要", 10)

    const store2 = new SessionStore(join(tmpDir, "sessions.json"))
    const reloaded = await store2.get(session.id)
    expect((reloaded as any).summary).toBe("跨实例摘要")
    expect((reloaded as any)._lastSummarizedMessageCount).toBe(10)
  })
})
