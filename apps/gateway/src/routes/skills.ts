import { Router } from "express"
import { SkillSchema } from "@chandaoplus/shared"

export function registerSkillRoutes(app: any, deps: any) {
  const router = Router()

  router.get("/", async (_req: any, res: any) => {
    try {
      const skills = await deps.skillStore.list()
      res.json(skills)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get("/:id", async (req: any, res: any) => {
    try {
      const skill = await deps.skillStore.get(req.params.id)
      if (!skill) {
        res.status(404).json({ error: "skill not found" })
        return
      }
      res.json(skill)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post("/", async (req: any, res: any) => {
    try {
      const skill = SkillSchema.parse({ ...req.body, builtin: false })
      await deps.skillStore.save(skill)
      res.json({ success: true })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.delete("/:id", async (req: any, res: any) => {
    try {
      await deps.skillStore.delete(req.params.id)
      res.json({ success: true })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  app.use("/api/skills", router)
}
