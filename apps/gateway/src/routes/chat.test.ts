import { mkdtempSync, rmSync } from "node:fs"
import http from "node:http"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { createServer } from "../server"

describe("POST /api/chat/stream", () => {
  it("streams agent output for a workspace-bound request", async () => {
    const messages: any[] = []
    const app = createServer({
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        get: async () => undefined,
        create: async () => ({ id: "test-session-id" }),
        appendMessage: async (sid: string, msg: any) => { messages.push(msg) },
        updateTitle: async () => {},
        addContextBundleDir: async () => {},
        updateCodexThreadId: async () => {},
        updateSummary: async () => {}
      },
      agentRegistry: {
        get: () => ({
          run: async ({ onChunk }: any) => {
            onChunk({ type: "status", content: "reading page bundle" })
            onChunk({ type: "text", content: "预计 0.5 人天" })
            onChunk({ type: "done", content: "" })
          }
        })
      }
    })

    const response = await request(app)
      .post("/api/chat/stream")
      .send({
        workspaceId: "project-a",
        agent: "claude-code",
        command: "estimate",
        page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
        messages: [{ role: "user", content: "评估" }]
      })

    expect(response.text).toContain("reading page bundle")
    expect(response.text).toContain("预计 0.5 人天")
    expect(response.text).toContain('"sessionId"')
    expect(messages.length).toBeGreaterThanOrEqual(1)
    expect(messages[0].role).toBe("user")
  })

  it("reuses existing session when valid sessionId provided", async () => {
    const messages: any[] = []
    const existingSession = { id: "550e8400-e29b-41d4-a716-446655440000", workspaceId: "project-a", messages: [] as any[] }
    const app = createServer({
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        get: async (sid: string) => sid === "550e8400-e29b-41d4-a716-446655440000" ? existingSession : undefined,
        create: async () => ({ id: "new-session-id" }),
        appendMessage: async (sid: string, msg: any) => { messages.push({ sid, msg }) },
        addContextBundleDir: async () => {},
        updateTitle: async () => {},
        updateCodexThreadId: async () => {},
        updateConfig: async () => {}
      },
      agentRegistry: {
        get: () => ({
          run: async ({ onChunk }: any) => {
            onChunk({ type: "text", content: "reused session reply" })
          }
        })
      }
    })

    const response = await request(app)
      .post("/api/chat/stream")
      .send({
        workspaceId: "project-a",
        agent: "claude-code",
        command: "estimate",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
        messages: [{ role: "user", content: "复用测试" }]
      })

    expect(response.status).toBe(200)
    expect(response.text).toContain('"sessionId":"550e8400-e29b-41d4-a716-446655440000"')
    expect(messages.length).toBeGreaterThanOrEqual(1)
    expect(messages[0].sid).toBe("550e8400-e29b-41d4-a716-446655440000")
    expect(messages[0].msg.role).toBe("user")
  })

  it("writes persisted session history into conversation.md for reused sessions", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "chandaoplus-chat-route-"))
    const existingSession = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      workspaceId: "project-a",
      messages: [
        { role: "user", content: "历史提问：这个禅道 BUG 怎么处理？" },
        { role: "assistant", content: "历史回答：先定位待报价详情页的国际化字段。" },
      ] as any[],
    }
    const otherSession = {
      id: "550e8400-e29b-41d4-a716-446655440002",
      workspaceId: "project-a",
      messages: [
        { role: "user", content: "另一个会话的敏感历史" },
      ] as any[],
    }
    let conversationText = ""

    try {
      const app = createServer({
        workspaceStore: {
          get: async () => ({ id: "project-a", label: "A项目", rootPath: workspaceRoot, defaultAgent: "claude-code" })
        },
        skillStore: {
          get: async () => undefined
        },
        sessionStore: {
          get: async (sid: string) => sid === existingSession.id ? existingSession : sid === otherSession.id ? otherSession : undefined,
          create: async () => ({ id: "new-session-id" }),
          appendMessage: async (_sid: string, msg: any) => { existingSession.messages.push(msg) },
          addContextBundleDir: async () => {},
          updateTitle: async () => {},
          updateCodexThreadId: async () => {},
          updateConfig: async () => {}
        },
        agentRegistry: {
          get: () => ({
            run: async ({ bundleDir, onChunk }: any) => {
              conversationText = await readFile(join(bundleDir, "conversation.md"), "utf8")
              onChunk({ type: "text", content: "ok" })
            }
          })
        }
      })

      await request(app)
        .post("/api/chat/stream")
        .send({
          workspaceId: "project-a",
          agent: "claude-code",
          command: "estimate",
          sessionId: existingSession.id,
          page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
          messages: [{ role: "user", content: "当前问题：继续评估" }]
        })

      expect(conversationText).toContain("# 会话历史")
      expect(conversationText).toContain("历史提问：这个禅道 BUG 怎么处理？")
      expect(conversationText).toContain("历史回答：先定位待报价详情页的国际化字段。")
      expect(conversationText).not.toContain("当前问题：继续评估")
      expect(conversationText).not.toContain("另一个会话的敏感历史")
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it("returns 404 for non-existent sessionId", async () => {
    const app = createServer({
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        get: async () => undefined,
        create: async () => ({ id: "test-session-id" }),
        appendMessage: async () => {},
        updateTitle: async () => {},
        addContextBundleDir: async () => {},
        updateCodexThreadId: async () => {}
      },
      agentRegistry: {
        get: () => ({
          run: async ({ onChunk }: any) => {}
        })
      }
    })

    const response = await request(app)
      .post("/api/chat/stream")
      .send({
        workspaceId: "project-a",
        agent: "claude-code",
        command: "estimate",
        sessionId: "00000000-0000-0000-0000-000000000000",
        page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
        messages: [{ role: "user", content: "评估" }]
      })

    expect(response.status).toBe(404)
  })

  it("keeps the agent running when the stream observer disconnects", async () => {
    let signalAborted = false
    let finishAgent!: () => void
    const messages: any[] = []
    const app = createServer({
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        get: async () => undefined,
        create: async () => ({ id: "550e8400-e29b-41d4-a716-446655440010" }),
        appendMessage: async (_sid: string, msg: any) => { messages.push(msg) },
        updateTitle: async () => {},
        addContextBundleDir: async () => {},
        updateCodexThreadId: async () => {},
        updateRunningTask: async () => {},
        clearRunningTask: async () => {}
      },
      agentRegistry: {
        get: () => ({
          run: async ({ onChunk, signal }: any) => {
            signal.addEventListener("abort", () => { signalAborted = true })
            onChunk({ type: "status", content: "agent started" })
            await new Promise<void>((resolve) => { finishAgent = resolve })
            onChunk({ type: "text", content: "后台完成" })
          }
        })
      }
    })
    const server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as any).port
    const controller = new AbortController()

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "project-a",
          agent: "claude-code",
          command: "estimate",
          page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
          messages: [{ role: "user", content: "评估" }]
        }),
        signal: controller.signal
      })
      expect(response.ok).toBe(true)
      const reader = response.body!.getReader()
      await reader.read()
      controller.abort()
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(signalAborted).toBe(false)
      finishAgent()
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(messages.some((msg) => msg.role === "assistant" && msg.content.includes("后台完成"))).toBe(true)
    } finally {
      server.close()
    }
  })

  it("aborts the agent only when the running task is explicitly stopped", async () => {
    let signalAborted = false
    let taskId = ""
    const app = createServer({
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        get: async () => undefined,
        create: async () => ({ id: "550e8400-e29b-41d4-a716-446655440011" }),
        appendMessage: async () => {},
        updateTitle: async () => {},
        addContextBundleDir: async () => {},
        updateCodexThreadId: async () => {},
        updateRunningTask: async (_sid: string, tid: string) => { taskId = tid },
        clearRunningTask: async () => {}
      },
      agentRegistry: {
        get: () => ({
          run: async ({ signal }: any) => {
            await new Promise<void>((resolve) => {
              signal.addEventListener("abort", () => {
                signalAborted = true
                resolve()
              })
            })
          }
        })
      }
    })
    const server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as any).port
    const controller = new AbortController()

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "project-a",
          agent: "claude-code",
          command: "estimate",
          page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
          messages: [{ role: "user", content: "评估" }]
        }),
        signal: controller.signal
      })
      expect(response.ok).toBe(true)
      await response.body!.getReader().read()
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(taskId).toBeTruthy()

      const stopResponse = await fetch(`http://127.0.0.1:${port}/api/chat/tasks/${taskId}/stop`, { method: "POST" })
      expect(stopResponse.status).toBe(200)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(signalAborted).toBe(true)
    } finally {
      controller.abort()
      server.close()
    }
  })

  it("allows a new observer to reconnect to a running task stream", async () => {
    let taskId = ""
    let finishAgent!: () => void
    const app = createServer({
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        get: async () => undefined,
        create: async () => ({ id: "550e8400-e29b-41d4-a716-446655440012" }),
        appendMessage: async () => {},
        updateTitle: async () => {},
        addContextBundleDir: async () => {},
        updateCodexThreadId: async () => {},
        updateRunningTask: async (_sid: string, tid: string) => { taskId = tid },
        clearRunningTask: async () => {}
      },
      agentRegistry: {
        get: () => ({
          run: async ({ onChunk }: any) => {
            onChunk({ type: "status", content: "agent started" })
            await new Promise<void>((resolve) => { finishAgent = resolve })
            onChunk({ type: "text", content: "重连后可见" })
          }
        })
      }
    })
    const server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as any).port
    const controller = new AbortController()

    try {
      const firstResponse = await fetch(`http://127.0.0.1:${port}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "project-a",
          agent: "claude-code",
          command: "estimate",
          page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
          messages: [{ role: "user", content: "评估" }]
        }),
        signal: controller.signal
      })
      expect(firstResponse.ok).toBe(true)
      await firstResponse.body!.getReader().read()
      await new Promise((resolve) => setTimeout(resolve, 20))
      controller.abort()
      expect(taskId).toBeTruthy()

      const reconnected = fetch(`http://127.0.0.1:${port}/api/chat/tasks/${taskId}/stream`)
      await new Promise((resolve) => setTimeout(resolve, 20))
      finishAgent()
      const reconnectedText = await (await reconnected).text()

      expect(reconnectedText).toContain("agent started")
      expect(reconnectedText).toContain("重连后可见")
    } finally {
      server.close()
    }
  })

  it("cleans completed tasks from memory and clears running task state", async () => {
    const taskStore = new Map<string, any>()
    const runningUpdates: any[] = []
    const app = createServer({
      chatTaskStore: taskStore,
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        get: async () => undefined,
        create: async () => ({ id: "550e8400-e29b-41d4-a716-446655440013" }),
        appendMessage: async () => {},
        updateTitle: async () => {},
        addContextBundleDir: async () => {},
        updateCodexThreadId: async () => {},
        updateRunningTask: async (_sid: string, tid: string, status: string) => { runningUpdates.push({ tid, status }) },
        clearRunningTask: async (_sid: string, tid: string) => { runningUpdates.push({ tid, status: "cleared" }) }
      },
      agentRegistry: {
        get: () => ({
          run: async ({ onChunk }: any) => {
            onChunk({ type: "text", content: "完成" })
          }
        })
      }
    })

    const response = await request(app)
      .post("/api/chat/stream")
      .send({
        workspaceId: "project-a",
        agent: "claude-code",
        command: "estimate",
        page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
        messages: [{ role: "user", content: "评估" }]
      })

    expect(response.status).toBe(200)
    expect(response.text).toContain("完成")
    expect(taskStore.size).toBe(0)
    expect(runningUpdates.some((item) => item.status === "cleared")).toBe(true)
  })

  it("does not mark a completed task as stopping when stop is called late", async () => {
    const taskStore = new Map<string, any>()
    const runningUpdates: any[] = []
    let taskId = ""
    const app = createServer({
      chatTaskStore: taskStore,
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        get: async () => undefined,
        create: async () => ({ id: "550e8400-e29b-41d4-a716-446655440014" }),
        appendMessage: async () => {},
        updateTitle: async () => {},
        addContextBundleDir: async () => {},
        updateCodexThreadId: async () => {},
        updateRunningTask: async (_sid: string, tid: string, status: string) => {
          taskId = tid
          runningUpdates.push({ tid, status })
        },
        clearRunningTask: async () => {}
      },
      agentRegistry: {
        get: () => ({
          run: async ({ onChunk }: any) => {
            onChunk({ type: "text", content: "完成" })
          }
        })
      }
    })

    await request(app)
      .post("/api/chat/stream")
      .send({
        workspaceId: "project-a",
        agent: "claude-code",
        command: "estimate",
        page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
        messages: [{ role: "user", content: "评估" }]
      })

    const stopResponse = await request(app).post(`/api/chat/tasks/${taskId}/stop`).send()
    expect(stopResponse.status).toBe(404)
    expect(runningUpdates.filter((item) => item.status === "stopping")).toHaveLength(0)
  })

  it("rejects a second task for the same running session", async () => {
    let finishAgent!: () => void
    const existingSession = {
      id: "550e8400-e29b-41d4-a716-446655440015",
      workspaceId: "project-a",
      messages: [],
      runningTaskId: "stale-value"
    }
    const app = createServer({
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        get: async () => existingSession,
        create: async () => ({ id: "new-session-id" }),
        appendMessage: async () => {},
        updateTitle: async () => {},
        addContextBundleDir: async () => {},
        updateCodexThreadId: async () => {},
        updateConfig: async () => {},
        updateRunningTask: async (_sid: string, tid: string) => { existingSession.runningTaskId = tid },
        clearRunningTask: async () => {}
      },
      agentRegistry: {
        get: () => ({
          run: async () => {
            await new Promise<void>((resolve) => { finishAgent = resolve })
          }
        })
      }
    })
    const server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as any).port
    const controller = new AbortController()

    try {
      const firstResponse = await fetch(`http://127.0.0.1:${port}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "project-a",
          agent: "claude-code",
          command: "estimate",
          sessionId: existingSession.id,
          page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
          messages: [{ role: "user", content: "第一次" }]
        }),
        signal: controller.signal
      })
      expect(firstResponse.ok).toBe(true)
      await firstResponse.body!.getReader().read()

      const secondResponse = await fetch(`http://127.0.0.1:${port}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "project-a",
          agent: "claude-code",
          command: "estimate",
          sessionId: existingSession.id,
          page: { url: "https://zentao.local/bug-view-1.html", title: "BUG #1", markdown: "# BUG #1", images: [], metadata: {} },
          messages: [{ role: "user", content: "第二次" }]
        })
      })
      expect(secondResponse.status).toBe(409)
    } finally {
      finishAgent?.()
      controller.abort()
      server.close()
    }
  })

  it("clears stale persisted running task state when reconnecting to a missing task", async () => {
    let clearedTaskId = ""
    const app = createServer({
      workspaceStore: {
        get: async () => ({ id: "project-a", label: "A项目", rootPath: "/tmp/project-a", defaultAgent: "claude-code" })
      },
      skillStore: {
        get: async () => undefined
      },
      sessionStore: {
        clearRunningTaskByTaskId: async (taskId: string) => { clearedTaskId = taskId }
      },
      agentRegistry: {
        get: () => undefined
      }
    })

    const response = await request(app).get("/api/chat/tasks/stale-task/stream")

    expect(response.status).toBe(404)
    expect(clearedTaskId).toBe("stale-task")
  })
})
