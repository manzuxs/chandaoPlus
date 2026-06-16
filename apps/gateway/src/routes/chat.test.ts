import { mkdtempSync, rmSync } from "node:fs"
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
        updateCodexThreadId: async () => {}
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
})
