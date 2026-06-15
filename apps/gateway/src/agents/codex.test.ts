import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { codexAdapter } from "./codex"

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}))

function createCodexChild(stdoutLines: string[]) {
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

describe("codexAdapter", () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it("streams agent_message text from Codex item.completed events", async () => {
    spawnMock.mockImplementation(() =>
      createCodexChild([
        JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
        JSON.stringify({ type: "item.completed", item: { id: "item-1", type: "agent_message", text: "OK" } }),
        JSON.stringify({ type: "turn.completed" }),
      ])
    )

    const chunks: any[] = []
    const sessionStore = {
      get: vi.fn().mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440000", codexThreadId: undefined }),
      updateCodexThreadId: vi.fn().mockResolvedValue(undefined),
    }

    await codexAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "codex" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "codex",
        command: "default",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hello" }],
      },
      skill: undefined,
      sessionStore,
      onChunk: (chunk) => chunks.push(chunk),
    })

    expect(chunks).toContainEqual({ type: "text", content: "OK" })
    expect(sessionStore.updateCodexThreadId).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      "thread-1"
    )
  })
})
