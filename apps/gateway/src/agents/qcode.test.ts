import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { qcodeAdapter } from "./qcode"
import { createMockChildProcess } from "./test-helpers"

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}))

describe("qcodeAdapter", () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it("streams text content from stream_event text_delta events", async () => {
    spawnMock.mockImplementation(() =>
      createMockChildProcess({
        stdoutLines: [
          JSON.stringify({
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "Hello from Qcode" },
            },
          }),
        ],
      })
    )

    const chunks: any[] = []
    const sessionStore = { get: vi.fn().mockResolvedValue(null) }

    await qcodeAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "qcode" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "qcode",
        command: "default",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hello" }],
      },
      skill: undefined,
      sessionStore,
      onChunk: (chunk) => chunks.push(chunk),
    })

    expect(chunks).toContainEqual({ type: "text", content: "Hello from Qcode" })
  })

  it("streams status messages from progress and tool use events", async () => {
    spawnMock.mockImplementation(() =>
      createMockChildProcess({
        stdoutLines: [
          JSON.stringify({
            type: "progress",
            content: "Indexing workspace..."
          }),
          JSON.stringify({
            type: "stream_event",
            event: {
              type: "content_block_start",
              content_block: {
                type: "tool_use",
                name: "read",
                input: { path: "src/index.ts" },
              },
            },
          }),
        ],
      })
    )

    const chunks: any[] = []
    const sessionStore = { get: vi.fn().mockResolvedValue(null) }

    await qcodeAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "qcode" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "qcode",
        command: "default",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hello" }],
      },
      skill: undefined,
      sessionStore,
      onChunk: (chunk) => chunks.push(chunk),
    })

    expect(chunks).toContainEqual({ type: "status", content: "Indexing workspace..." })
    expect(chunks).toContainEqual({ type: "status", content: "正在阅读文件: src/index.ts..." })
  })

  it("throws error and does not fallback to claudeCodeAdapter if spawn throws ENOENT", async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as any
      child.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()

      queueMicrotask(() => {
        const err = new Error("spawn qcode ENOENT")
        ;(err as any).code = "ENOENT"
        child.emit("error", err)
      })

      return child
    })

    const sessionStore = { get: vi.fn().mockResolvedValue(null) }

    await expect(
      qcodeAdapter.run({
        workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "qcode" },
        bundleDir: "/tmp/bundle",
        request: {
          workspaceId: "project-a",
          agent: "qcode",
          command: "default",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
          messages: [{ role: "user", content: "Hello" }],
        },
        skill: undefined,
        sessionStore,
        onChunk: vi.fn(),
      })
    ).rejects.toThrow("ENOENT")
  })

  it("streams text from qcode-specific assistant delta events", async () => {
    spawnMock.mockImplementation(() =>
      createMockChildProcess({
        stdoutLines: [
          JSON.stringify({
            type: "assistant",
            message: {
              delta: {
                text: "Qcode assistant response",
              },
            },
          }),
        ],
      })
    )

    const chunks: any[] = []
    const sessionStore = { get: vi.fn().mockResolvedValue(null) }

    await qcodeAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "qcode" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "qcode",
        command: "default",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hello" }],
      },
      skill: undefined,
      sessionStore,
      onChunk: (chunk) => chunks.push(chunk),
    })

    expect(chunks).toContainEqual({ type: "text", content: "Qcode assistant response" })
  })

  it("falls back from --resume to --session-id when session not found on disk", async () => {
    // 第一次 spawn：模拟 session 不存在的错误
    spawnMock.mockImplementationOnce(() => {
      const child = new EventEmitter() as any
      child.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      queueMicrotask(() => {
        child.stderr.emit("data", "No conversation found for session")
        child.emit("close", 1)
      })
      return child
    })
    // 第二次 spawn：fallback 成功
    spawnMock.mockImplementationOnce(() =>
      createMockChildProcess({
        stdoutLines: [
          JSON.stringify({
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "Fallback success" },
            },
          }),
        ],
      })
    )

    const chunks: any[] = []
    const sessionStore = {
      get: vi.fn().mockResolvedValue({
        id: "550e8400-e29b-41d4-a716-446655440000",
        messages: [{ role: "user", content: "Prior question" }, { role: "assistant", content: "Prior answer" }],
      }),
    }

    await qcodeAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "qcode" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "qcode",
        command: "default",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hello" }],
      },
      skill: undefined,
      sessionStore,
      onChunk: (chunk) => chunks.push(chunk),
    })

    // 验证 spawn 被调用了两次（第一次用 --resume 失败，第二次用 --session-id 重试）
    expect(spawnMock).toHaveBeenCalledTimes(2)
    const firstCallArgs = spawnMock.mock.calls[0][1]
    expect(firstCallArgs).toContain("--resume")
    const secondCallArgs = spawnMock.mock.calls[1][1]
    expect(secondCallArgs).toContain("--session-id")
    expect(secondCallArgs).not.toContain("--resume")
    expect(chunks).toContainEqual({ type: "text", content: "Fallback success" })
  })
})
