import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { antigravityAdapter } from "./antigravity"

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}))

function createChildProcess(stdoutLines: string[]) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
    stdout: EventEmitter
    stderr: EventEmitter
  }

  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()

  queueMicrotask(() => {
    child.stdout.emit("data", stdoutLines.join("\n") + "\n")
    child.emit("close", 0)
  })

  return child
}

describe("antigravityAdapter", () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it("streams text content from stream_event text_delta events", async () => {
    spawnMock.mockImplementation(() =>
      createChildProcess([
        JSON.stringify({
          type: "stream_event",
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Hello from Antigravity" }
          }
        }),
      ])
    )

    const chunks: any[] = []
    const sessionStore = {
      get: vi.fn().mockResolvedValue(null)
    }

    await antigravityAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "antigravity" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "antigravity",
        command: "default",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hello" }],
      },
      skill: undefined,
      sessionStore,
      onChunk: (chunk) => chunks.push(chunk),
    })

    expect(chunks).toContainEqual({ type: "text", content: "Hello from Antigravity" })
  })

  it("streams status messages from progress and tool use events", async () => {
    spawnMock.mockImplementation(() =>
      createChildProcess([
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
              name: "view_file",
              input: { path: "src/index.ts" }
            }
          }
        })
      ])
    )

    const chunks: any[] = []
    const sessionStore = {
      get: vi.fn().mockResolvedValue(null)
    }

    await antigravityAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "antigravity" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "antigravity",
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

  it("throws explicit error if spawn throws ENOENT", async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as any
      child.stdin = { write: vi.fn(), end: vi.fn() }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      
      queueMicrotask(() => {
        const err = new Error("spawn agy ENOENT")
        ;(err as any).code = "ENOENT"
        child.emit("error", err)
      })
      return child
    })

    const chunks: any[] = []
    const sessionStore = {
      get: vi.fn().mockResolvedValue(null)
    }

    await expect(
      antigravityAdapter.run({
        workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "antigravity" },
        bundleDir: "/tmp/bundle",
        request: {
          workspaceId: "project-a",
          agent: "antigravity",
          command: "default",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
          messages: [{ role: "user", content: "Hello" }],
        },
        skill: undefined,
        sessionStore,
        onChunk: (chunk) => chunks.push(chunk),
      })
    ).rejects.toThrow("未检测到本地 agy 命令行工具，请检查 PATH 或 ANTIGRAVITY_BIN 环境变量。")
  })
})
