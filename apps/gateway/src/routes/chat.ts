import { Router } from "express"
import crypto from "node:crypto"
import { ChatRequestSchema } from "@chandaoplus/shared"
import { writeContextBundle } from "../services/context-bundle-writer"
import { CODEX_BIN } from "../config"

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
        request.sessionId = sessionId
        const firstUserMsg = request.messages.find((m: { role: string }) => m.role === "user")
        if (firstUserMsg) {
          const title = firstUserMsg.content.replace(/\n/g, " ").slice(0, 50)
          await deps.sessionStore.updateTitle(sessionId, title)
        }
      }

      // 持久化用户消息
      for (const msg of request.messages) {
        await deps.sessionStore.appendMessage(sessionId, msg)
      }

      const contextSessionId = crypto.randomUUID()
      const bundleDir = await writeContextBundle(workspace.rootPath, contextSessionId, request.page)
      await deps.sessionStore.addContextBundleDir(sessionId, bundleDir)

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
          }).catch((err: any) => { console.error("Failed to persist interrupted message:", err) })
        }
      })

      try {
        const skill = await deps.skillStore.get(request.command)
        await adapter.run({
          request,
          workspace,
          bundleDir,
          skill,
          sessionStore: deps.sessionStore,
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

  router.get("/models", async (req, res) => {
    try {
      const agent = req.query.agent
      if (agent === "codex") {
        const { exec } = await import("node:child_process")
        const { promisify } = await import("node:util")
        const execAsync = promisify(exec)
        
        try {
          const bin = process.env.CODEX_BIN || CODEX_BIN || "codex"
          const { stdout } = await execAsync(`${bin} debug models`, { maxBuffer: 10 * 1024 * 1024 })
          const rawData = JSON.parse(stdout)
          const rawList = Array.isArray(rawData) ? rawData : (rawData.models || [])
          const mapped = rawList.map((m: any) => ({
            id: m.slug || m.id,
            name: m.display_name || m.name || m.slug || m.id,
            hasReasoning: !!(m.supported_reasoning_levels && m.supported_reasoning_levels.length > 0) || !!m.hasReasoning
          }))
          res.json(mapped)
        } catch (err: any) {
          console.error("Failed to run codex debug models:", err)
          res.json([
            { id: "default", name: "默认模型 (Auto)", hasReasoning: false },
            { id: "gpt-4o", name: "GPT-4o", hasReasoning: false },
            { id: "gpt-4o-mini", name: "GPT-4o Mini", hasReasoning: false },
            { id: "o1", name: "o1", hasReasoning: true },
            { id: "o3-mini", name: "o3-mini", hasReasoning: true }
          ])
        }
        res.json([
          { id: "default", name: "默认模型 (Sonnet)", hasReasoning: true },
          { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", hasReasoning: true },
          { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", hasReasoning: false },
          { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", hasReasoning: false },
          { id: "claude-3-opus", name: "Claude 3 Opus", hasReasoning: false }
        ])
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.use("/api/chat", router)
}
