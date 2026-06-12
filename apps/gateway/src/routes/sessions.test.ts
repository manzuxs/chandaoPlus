import request from "supertest"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
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

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "session-routes-test-"))
    store = new SessionStore(path.join(tmpDir, "sessions.json"))
    app = express()
    app.use(express.json())
    registerSessionRoutes(app, { sessionStore: store })
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
    await store.create("ws-1", "Session A")
    await store.create("ws-1", "Session B")
    const res = await request(app).get("/api/sessions?workspaceId=ws-1")
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].messageCount).toBe(0)
  })

  it("GET /api/sessions returns 400 without workspaceId", async () => {
    const res = await request(app).get("/api/sessions")
    expect(res.status).toBe(400)
  })

  it("GET /api/sessions/:id returns a session", async () => {
    const session = await store.create("ws-1")
    await store.appendMessage(session.id, { role: "user", content: "hello" })
    const res = await request(app).get(`/api/sessions/${session.id}`)
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(1)
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
})
