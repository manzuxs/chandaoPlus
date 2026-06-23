import request from "supertest"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import express from "express"
import path from "node:path"
import os from "node:os"
import { mkdtempSync, rmSync } from "node:fs"
import { SessionStore } from "../services/session-store"
import { registerSessionRoutes } from "./sessions"

describe("Session Routes", () => {
  let app: express.Express
  let store: SessionStore
  let tmpDir: string
  let chatTaskStoreMock: Map<string, any>

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "session-routes-test-"))
    store = new SessionStore(path.join(tmpDir, "sessions.json"))
    app = express()
    app.use(express.json())
    chatTaskStoreMock = new Map()
    registerSessionRoutes(app, { sessionStore: store, chatTaskStore: chatTaskStoreMock })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("POST /api/sessions creates a session", async () => {
    const res = await request(app)
      .post("/api/sessions")
      .send({ workspaceId: "ws-1" })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.workspaceId).toBe("ws-1")
    expect(res.body.messages).toEqual([])
  })

  it("POST /api/sessions returns 400 for invalid body", async () => {
    const res = await request(app)
      .post("/api/sessions")
      .send({})
    expect(res.status).toBe(400)
  })

  it("GET /api/sessions lists sessions for a workspace", async () => {
    const running = await store.create("ws-1", "Session A")
    await store.updateRunningTask(running.id, "task-1", "running")
    await store.create("ws-1", "Session B")
    const res = await request(app).get("/api/sessions?workspaceId=ws-1")
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].messageCount).toBe(0)
    const runningItem = res.body.find((item: any) => item.id === running.id)
    expect(runningItem.runningTaskId).toBe("task-1")
    expect(runningItem.runningStatus).toBe("running")
  })

  it("GET /api/sessions returns 400 without workspaceId", async () => {
    const res = await request(app).get("/api/sessions")
    expect(res.status).toBe(400)
  })

  it("GET /api/sessions/:id returns a session", async () => {
    const session = await store.create("ws-1")
    await store.appendMessage(session.id, { role: "user", content: "hello" })
    await store.updateRunningTask(session.id, "task-2", "stopping")
    const res = await request(app).get(`/api/sessions/${session.id}`)
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(1)
    expect(res.body.runningTaskId).toBe("task-2")
    expect(res.body.runningStatus).toBe("stopping")
  })

  it("GET /api/sessions/:id returns 404 for missing session", async () => {
    const res = await request(app).get("/api/sessions/non-existent")
    expect(res.status).toBe(404)
  })

  it("DELETE /api/sessions/:id deletes a session", async () => {
    const session = await store.create("ws-1")
    const res = await request(app).delete(`/api/sessions/${session.id}`)
    expect(res.status).toBe(204)
    const found = await store.get(session.id)
    expect(found).toBeUndefined()
  })

  it("DELETE /api/sessions/:id returns 404 for missing session", async () => {
    const res = await request(app).delete("/api/sessions/non-existent")
    expect(res.status).toBe(404)
  })

  it("DELETE /api/sessions/:id aborts and deletes associated running task", async () => {
    const session = await store.create("ws-1")
    const abortSpy = vi.fn()
    const mockTask = {
      id: "task-1",
      sessionId: session.id,
      workspaceId: "ws-1",
      abortController: { abort: abortSpy },
      stopRequested: false
    }
    chatTaskStoreMock.set(mockTask.id, mockTask)

    const res = await request(app).delete(`/api/sessions/${session.id}`)
    expect(res.status).toBe(204)
    expect(mockTask.stopRequested).toBe(true)
    expect(abortSpy).toHaveBeenCalled()
    expect(chatTaskStoreMock.has("task-1")).toBe(false)
  })

  it("POST /api/sessions/batch-delete deletes sessions in batch and aborts active tasks", async () => {
    const session1 = await store.create("ws-1")
    const session2 = await store.create("ws-1")
    
    const abortSpy1 = vi.fn()
    const abortSpy2 = vi.fn()
    const mockTask1 = {
      id: "task-1",
      sessionId: session1.id,
      workspaceId: "ws-1",
      abortController: { abort: abortSpy1 },
      stopRequested: false
    }
    const mockTask2 = {
      id: "task-2",
      sessionId: session2.id,
      workspaceId: "ws-1",
      abortController: { abort: abortSpy2 },
      stopRequested: false
    }
    chatTaskStoreMock.set(mockTask1.id, mockTask1)
    chatTaskStoreMock.set(mockTask2.id, mockTask2)

    const res = await request(app)
      .post("/api/sessions/batch-delete")
      .send({ ids: [session1.id, session2.id] })
      
    expect(res.status).toBe(204)
    expect(mockTask1.stopRequested).toBe(true)
    expect(mockTask2.stopRequested).toBe(true)
    expect(abortSpy1).toHaveBeenCalled()
    expect(abortSpy2).toHaveBeenCalled()
    expect(chatTaskStoreMock.has("task-1")).toBe(false)
    expect(chatTaskStoreMock.has("task-2")).toBe(false)

    expect(await store.get(session1.id)).toBeUndefined()
    expect(await store.get(session2.id)).toBeUndefined()
  })

  it("POST /api/sessions/batch-delete returns 400 for invalid body", async () => {
    const res = await request(app)
      .post("/api/sessions/batch-delete")
      .send({})
    expect(res.status).toBe(400)
  })
})
