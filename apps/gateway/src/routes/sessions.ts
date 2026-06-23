import { Router } from "express"
import { CreateSessionRequestSchema } from "@chandaoplus/shared"

export function registerSessionRoutes(app: any, deps: any) {
  const router = Router()

  router.post("/", async (req, res) => {
    try {
      const parsed = CreateSessionRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: parsed.error.issues })
        return
      }
      const session = await deps.sessionStore.create(parsed.data.workspaceId)
      res.status(201).json(session)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get("/", async (req, res) => {
    try {
      const workspaceId = req.query.workspaceId
      if (typeof workspaceId !== "string") {
        res.status(400).json({ error: "workspaceId query param required" })
        return
      }
      const sessions = await deps.sessionStore.listByWorkspace(workspaceId)
      res.json(sessions)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get("/:id", async (req, res) => {
    try {
      const session = await deps.sessionStore.get(req.params.id)
      if (!session) {
        res.status(404).json({ error: "Session not found" })
        return
      }
      res.json(session)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.delete("/:id", async (req, res) => {
    try {
      const sessionId = req.params.id
      if (deps.chatTaskStore) {
        for (const task of deps.chatTaskStore.values()) {
          if (task.sessionId === sessionId) {
            task.stopRequested = true
            task.abortController?.abort()
            deps.chatTaskStore.delete(task.id)
          }
        }
      }
      await deps.sessionStore.delete(sessionId)
      res.status(204).end()
    } catch (err: any) {
      if (err.message?.includes("not found")) {
        res.status(404).json({ error: "Session not found" })
      } else {
        res.status(500).json({ error: err.message })
      }
    }
  })

  app.use("/api/sessions", router)
}
