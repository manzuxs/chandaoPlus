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

function createOpencodeChild() {
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
    child.emit("close", 0)
  })

  return child
}

describe("opencodeAdapter", () => {
  beforeEach(() => {
    childProcessMock.spawn.mockReset()
    childProcessMock.execSync.mockReset()
  })

  it("passes parsed macOS proxy ports to OpenCode", async () => {
    childProcessMock.execSync.mockReturnValue(Buffer.from(`
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7897
  HTTPProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 7897
  SOCKSProxy : 127.0.0.1
}
`))
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
    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:7897")
    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7897")
    expect(env.ALL_PROXY).toBe("socks5://127.0.0.1:7897")
  })
})
