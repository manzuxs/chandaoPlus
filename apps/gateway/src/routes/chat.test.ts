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
        appendMessage: async (sid: string, msg: any) => { messages.push(msg) }
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
        appendMessage: async () => {}
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
