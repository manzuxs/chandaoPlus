import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { opencodeAdapter } from "./opencode"

const childProcessMock = vi.hoisted(() => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}))

vi.mock("node:child_process", () => ({
  spawn: childProcessMock.spawn,
  execSync: childProcessMock.execSync,
}))

function createOpencodeChild(options: { autoClose?: boolean } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
    stdout: EventEmitter
    stderr: EventEmitter
    pid?: number
  }

  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = 12345

  if (options.autoClose !== false) {
    queueMicrotask(() => {
      child.emit("close", 0)
    })
  }

  return child
}

describe("opencodeAdapter", () => {
  beforeEach(() => {
    childProcessMock.spawn.mockReset()
    childProcessMock.execSync.mockReset()
  })

  it("does not probe or inject macOS system proxy settings", async () => {
    childProcessMock.execSync.mockImplementation(() => {
      throw new Error("scutil should not be called")
    })
    childProcessMock.spawn.mockImplementation(() => createOpencodeChild())

    await opencodeAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "opencode" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "opencode",
        command: "estimate",
        model: "opencode-go/kimi-k2.6",
        effort: "medium",
        permissionMode: "full",
        page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hello" }],
      },
      skill: undefined,
      sessionStore: undefined,
      onChunk: vi.fn(),
    })

    const env = childProcessMock.spawn.mock.calls[0]?.[2]?.env
    expect(childProcessMock.execSync).not.toHaveBeenCalled()
    expect(env.HTTP_PROXY).toBe(process.env.HTTP_PROXY)
    expect(env.HTTPS_PROXY).toBe(process.env.HTTPS_PROXY)
    expect(env.ALL_PROXY).toBe(process.env.ALL_PROXY)
  })

  it("parses a final JSON event even when stdout has no trailing newline", async () => {
    childProcessMock.execSync.mockReturnValue(Buffer.from(""))
    const child = createOpencodeChild({ autoClose: false })
    childProcessMock.spawn.mockReturnValue(child)
    const onChunk = vi.fn()

    const runPromise = opencodeAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "opencode" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "opencode",
        command: "estimate",
        model: "opencode-go/kimi-k2.6",
        effort: "medium",
        permissionMode: "full",
        page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hello" }],
      },
      skill: undefined,
      sessionStore: undefined,
      onChunk,
    })

    // 等待一拍，确保异步 buildPrompt 执行完且 child 开始被监听
    await new Promise((resolve) => setTimeout(resolve, 10))

    child.stdout.emit("data", Buffer.from(JSON.stringify({
      type: "text",
      sessionID: "ses_final_buffer",
      part: { type: "text", text: "OK" },
    })))
    child.emit("close", 0)
    await runPromise

    expect(onChunk).toHaveBeenCalledWith({ type: "text", content: "OK" })
  })

  it("logs unhandled event types so OpenCode activity can be monitored", async () => {
    childProcessMock.execSync.mockReturnValue(Buffer.from(""))
    const child = createOpencodeChild({ autoClose: false })
    childProcessMock.spawn.mockReturnValue(child)
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const runPromise = opencodeAdapter.run({
        workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "opencode" },
        bundleDir: "/tmp/bundle",
        request: {
          workspaceId: "project-a",
          agent: "opencode",
          command: "estimate",
          model: "opencode-go/kimi-k2.6",
          effort: "medium",
          permissionMode: "full",
          page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
          messages: [{ role: "user", content: "Hello" }],
        },
        skill: undefined,
        sessionStore: undefined,
        onChunk: vi.fn(),
      })

      // 等待一拍，确保异步 buildPrompt 执行完且 child 开始被监听
      await new Promise((resolve) => setTimeout(resolve, 10))

      child.stdout.emit("data", Buffer.from(`${JSON.stringify({
        type: "step_finish",
        sessionID: "ses_monitor",
        part: { type: "step-finish", reason: "stop" },
      })}\n`))
      child.emit("close", 0)
      await runPromise

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[OpenCode event] step_finish"))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[OpenCode close] code=0"))
    } finally {
      consoleLogSpy.mockRestore()
    }
  })

  it("extracts path and command parameters to display user-friendly tool use status", async () => {
    childProcessMock.execSync.mockReturnValue(Buffer.from(""))
    const child = createOpencodeChild({ autoClose: false })
    childProcessMock.spawn.mockReturnValue(child)
    const onChunk = vi.fn()

    const runPromise = opencodeAdapter.run({
      workspace: { id: "project-a", label: "Project A", rootPath: "/tmp/project-a", defaultAgent: "opencode" },
      bundleDir: "/tmp/bundle",
      request: {
        workspaceId: "project-a",
        agent: "opencode",
        command: "estimate",
        model: "opencode-go/kimi-k2.6",
        effort: "medium",
        permissionMode: "full",
        page: { url: "https://example.com", title: "Example", markdown: "# Example", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hello" }],
      },
      skill: undefined,
      sessionStore: undefined,
      onChunk,
    })

    // 等待一拍，确保异步 buildPrompt 执行完且 child 开始被监听
    await new Promise((resolve) => setTimeout(resolve, 10))

    child.stdout.emit("data", Buffer.from(`${JSON.stringify({
      type: "tool_use",
      sessionID: "ses_tool",
      part: {
        type: "tool",
        tool: "read",
        input: { path: "src/utils.ts" }
      }
    })}\n`))
    
    child.stdout.emit("data", Buffer.from(`${JSON.stringify({
      type: "tool_use",
      sessionID: "ses_tool",
      part: {
        type: "tool",
        tool: "bash",
        arguments: { command: "pnpm test" }
      }
    })}\n`))

    child.emit("close", 0)
    await runPromise

    expect(onChunk).toHaveBeenCalledWith({ type: "status", content: "正在阅读文件: src/utils.ts..." })
    expect(onChunk).toHaveBeenCalledWith({ type: "status", content: "正在执行命令: pnpm test..." })
  })
})
