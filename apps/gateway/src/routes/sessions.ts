import { Router } from "express"
import { CreateSessionRequestSchema } from "@chandaoplus/shared"
import { cleanupWorktreesForSession, extractTaskLabel } from "../services/worktree-manager"

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

      // 尝试清理对应的 worktree（不依赖 worktreeMode 字段，直接检查目录是否存在）
      try {
        const session = await deps.sessionStore.get(sessionId)
        if (session && deps.workspaceStore) {
          const workspace = await deps.workspaceStore.get(session.workspaceId)
          if (workspace) {
            const lockedPage = (session as any).lockedPage
            const taskLabel = extractTaskLabel(lockedPage?.metadata)
            await cleanupWorktreesForSession(workspace.rootPath, taskLabel, sessionId, true, session.worktreeDirName)
          }
        }
      } catch (wtErr: any) {
        console.error(`[SessionsRoute] Failed to cleanup worktree for session ${sessionId}:`, wtErr)
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

  router.post("/batch-delete", async (req, res) => {
    try {
      const { ids } = req.body
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "ids must be a non-empty array" })
        return
      }

      if (deps.chatTaskStore) {
        for (const task of deps.chatTaskStore.values()) {
          if (ids.includes(task.sessionId)) {
            task.stopRequested = true
            task.abortController?.abort()
            deps.chatTaskStore.delete(task.id)
          }
        }
      }

      // 批量清理对应的 worktree
      for (const sessionId of ids) {
        try {
          const session = await deps.sessionStore.get(sessionId)
          if (session && deps.workspaceStore) {
            const workspace = await deps.workspaceStore.get(session.workspaceId)
            if (workspace) {
              const lockedPage = (session as any).lockedPage
              const taskLabel = extractTaskLabel(lockedPage?.metadata)
              await cleanupWorktreesForSession(workspace.rootPath, taskLabel, sessionId, true, session.worktreeDirName)
            }
          }
        } catch (wtErr: any) {
          console.error(`[SessionsRoute] Failed to cleanup worktree for session ${sessionId} in batch:`, wtErr)
        }
      }

      await deps.sessionStore.deleteBatch(ids)
      res.status(204).end()
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.use("/api/sessions", router)
}
