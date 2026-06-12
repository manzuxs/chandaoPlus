import { Router } from "express"
import crypto from "node:crypto"
import { ChatRequestSchema } from "@chandaoplus/shared"
import { writeContextBundle } from "../services/context-bundle-writer"

export function registerChatRoutes(app: any, deps: any) {
  const router = Router()

  router.post("/stream", async (req, res) => {
    try {
      const request = ChatRequestSchema.parse(req.body)
      const workspace = await deps.workspaceStore.get(request.workspaceId)
      if (!workspace) {
        res.status(404).json({ error: "workspace not found" })
        return
      }

      const sessionId = crypto.randomUUID()
      const bundleDir = await writeContextBundle(workspace.rootPath, sessionId, request.page)

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("Connection", "keep-alive")

      res.write(`data: ${JSON.stringify({ type: "status", content: `bundle ready: ${bundleDir}` })}\n\n`)

      const adapter = deps.agentRegistry.get(request.agent)
      if (!adapter) {
        res.write(`data: ${JSON.stringify({ type: "error", content: `agent not found: ${request.agent}` })}\n\n`)
        res.end()
        return
      }

      try {
        const skill = await deps.skillStore.get(request.command)
        await adapter.run({
          request,
          workspace,
          bundleDir,
          skill,
          onChunk: (chunk: any) => {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`)
          }
        })
        res.write(`data: ${JSON.stringify({ type: "done", content: "" })}\n\n`)
      } catch (err: any) {
        console.error("Agent process execution error:", err)
        res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`)
      } finally {
        res.end()
      }
    } catch (err: any) {
      console.error("Stream route validation/processing error:", err)
      if (!res.headersSent) {
        res.status(400).json({ error: err.message })
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`)
        res.end()
      }
    }
  })

  app.use("/api/chat", router)
}
