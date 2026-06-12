import { Router } from "express"
import { WorkspaceProfileSchema } from "@chandaoplus/shared"

export function registerWorkspaceRoutes(app: any, deps: any) {
  const router = Router()

  router.get("/", async (_req, res) => {
    try {
      const list = await deps.workspaceStore.list()
      res.json(list)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post("/", async (req, res) => {
    try {
      const profile = WorkspaceProfileSchema.parse(req.body)
      await deps.workspaceStore.save(profile)
      res.json({ success: true })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.put("/:id", async (req, res) => {
    try {
      const existing = await deps.workspaceStore.get(req.params.id)
      if (!existing) {
        res.status(404).json({ error: "workspace not found" })
        return
      }
      const profile = WorkspaceProfileSchema.parse({ ...existing, ...req.body, id: req.params.id })
      await deps.workspaceStore.save(profile)
      res.json({ success: true })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.delete("/:id", async (req, res) => {
    try {
      await deps.workspaceStore.delete(req.params.id)
      res.json({ success: true })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  app.use("/api/workspaces", router)
}
