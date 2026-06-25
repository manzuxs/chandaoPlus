import { beforeEach, describe, expect, it, vi } from "vitest"
import { codexAdapter } from "./codex"
import { createMockChildProcess } from "./test-helpers"

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}))

describe("codexAdapter", () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it("streams agent_message text from Codex item.completed events", async () => {
    spawnMock.mockImplementation(() =>
      createMockChildProcess({
        stdoutLines: [
          JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
          JSON.stringify({ type: "item.completed", item: { id: "item-1", type: "agent_message", text: "OK" } }),
          JSON.stringify({ type: "turn.completed" }),
        ],
      })
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

  it("streams status for command_execution from item.started events", async () => {
    spawnMock.mockImplementation(() =>
      createMockChildProcess({
        stdoutLines: [
          JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
          JSON.stringify({
            type: "item.started",
            item: {
              id: "item_1",
              type: "command_execution",
              command: "/bin/zsh -lc \"sed -n '1,220p' /Users/macxm/SKILL.md 2>&1 | head -c 4000\""
            }
          }),
          JSON.stringify({
            type: "item.started",
            item: {
              id: "item_2",
              type: "command_execution",
              command: "git apply some_changes.patch"
            }
          }),
          JSON.stringify({ type: "turn.completed" }),
        ],
      })
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

    expect(chunks).toContainEqual({ type: "status", content: "正在阅读文件: /Users/macxm/SKILL.md..." })
    expect(chunks).toContainEqual({ type: "status", content: "正在修改文件: some_changes.patch..." })
  })

  it("streams status for tool_calls from thread.run.step events", async () => {
    spawnMock.mockImplementation(() =>
      createMockChildProcess({
        stdoutLines: [
          JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
          JSON.stringify({
            type: "thread.run.step.created",
            step: {
              step_details: {
                tool_calls: [
                  {
                    type: "tool_call",
                    name: "read",
                    arguments: JSON.stringify({ path: "src/main.ts" })
                  }
                ]
              }
            }
          }),
          JSON.stringify({ type: "turn.completed" }),
        ],
      })
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

    expect(chunks).toContainEqual({ type: "status", content: "正在阅读文件: src/main.ts..." })
  })
})
