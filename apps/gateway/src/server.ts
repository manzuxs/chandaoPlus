import express from "express"
import { registerChatRoutes } from "./routes/chat"
import { registerWorkspaceRoutes } from "./routes/workspaces"
import { registerSkillRoutes } from "./routes/skills"
import { registerSessionRoutes } from "./routes/sessions"

export function createServer(deps: any) {
  const app = express()
  app.use(express.json({ limit: "10mb" }))
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    if (req.method === "OPTIONS") {
      res.sendStatus(200)
      return
    }
    next()
  })
  registerWorkspaceRoutes(app, deps)
  registerSkillRoutes(app, deps)
  registerSessionRoutes(app, deps)
  registerChatRoutes(app, deps)
  return app
}
