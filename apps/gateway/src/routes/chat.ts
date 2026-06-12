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

      // 处理 session：复用或创建
      let sessionId = request.sessionId
      if (sessionId) {
        const existing = await deps.sessionStore.get(sessionId)
        if (!existing) {
          res.status(404).json({ error: "Session not found" })
          return
        }
      } else {
        const session = await deps.sessionStore.create(request.workspaceId)
        sessionId = session.id
      }

      // 持久化用户消息
      for (const msg of request.messages) {
        await deps.sessionStore.appendMessage(sessionId, msg)
      }

      const contextSessionId = crypto.randomUUID()
      const bundleDir = await writeContextBundle(workspace.rootPath, contextSessionId, request.page)

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("Connection", "keep-alive")

      // 首帧返回 sessionId
      res.write(`data: ${JSON.stringify({ type: "meta", sessionId, workspaceId: request.workspaceId })}\n\n`)
      res.write(`data: ${JSON.stringify({ type: "status", content: `bundle ready: ${bundleDir}` })}\n\n`)

      const adapter = deps.agentRegistry.get(request.agent)
      if (!adapter) {
        res.write(`data: ${JSON.stringify({ type: "error", content: `agent not found: ${request.agent}` })}\n\n`)
        res.end()
        return
      }

      let assistantContent = ""

      // 流中断时持久化已接收的部分助手消息
      req.on("close", () => {
        if (assistantContent) {
          deps.sessionStore.appendMessage(sessionId!, {
            role: "assistant",
            content: assistantContent + "\n\n[连接中断]",
          }).catch(() => {})
        }
      })

      try {
        const skill = await deps.skillStore.get(request.command)
        await adapter.run({
          request,
          workspace,
          bundleDir,
          skill,
          onChunk: (chunk: any) => {
            if (chunk.type === "text") {
              assistantContent += chunk.content
            }
            res.write(`data: ${JSON.stringify(chunk)}\n\n`)
          }
        })
        res.write(`data: ${JSON.stringify({ type: "done", content: "" })}\n\n`)
      } catch (err: any) {
        console.error("Agent process execution error:", err)
        res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`)
      }

      // 持久化助手回复
      if (assistantContent) {
        await deps.sessionStore.appendMessage(sessionId, {
          role: "assistant",
          content: assistantContent,
        })
      }

      res.end()
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
