import { Router } from "express"
import crypto from "node:crypto"
import { ChatRequestSchema, type ChatMessage } from "@chandaoplus/shared"
import { writeContextBundle } from "../services/context-bundle-writer"
import { CODEX_BIN, OPENCODE_BIN } from "../config"

type TaskStatus = "running" | "completed" | "error" | "stopped"

type ChatTask = {
  id: string
  sessionId: string
  workspaceId: string
  events: any[]
  observers: Set<any>
  abortController: AbortController
  status: TaskStatus
  assistantContent: string
  hasPersisted: boolean
  stopRequested: boolean
}

function writeSse(res: any, chunk: any) {
  if (res.writableEnded || res.destroyed) return
  res.write(`data: ${JSON.stringify(chunk)}\n\n`)
}

export function registerChatRoutes(app: any, deps: any) {
  const router = Router()
  const tasks = deps.chatTaskStore || new Map<string, ChatTask>()

  const emitTaskEvent = (task: ChatTask, chunk: any) => {
    const seq = task.events.length
    const eventWithSeq = { ...chunk, seq }
    task.events.push(eventWithSeq)
    for (const observer of task.observers) {
      writeSse(observer, eventWithSeq)
    }
  }

  const heartbeatInterval = setInterval(() => {
    for (const task of tasks.values()) {
      for (const observer of task.observers) {
        if (!observer.writableEnded && !observer.destroyed) {
          observer.write(":\n\n")
        }
      }
    }
  }, 15000)
  heartbeatInterval.unref?.()

  const finishTask = async (task: ChatTask, status: TaskStatus) => {
    task.status = status
    if (task.assistantContent && !task.hasPersisted) {
      task.hasPersisted = true
      const suffix = status === "stopped" ? "\n\n[已停止]" : ""
      try {
        await deps.sessionStore.appendMessage(task.sessionId, {
          role: "assistant",
          content: task.assistantContent + suffix,
        })
      } catch (err: any) {
        console.error("Failed to persist assistant message:", err)
      }
    }
    try {
      await deps.sessionStore.clearRunningTask?.(task.sessionId, task.id)
    } catch (err: any) {
      console.error("Failed to clear running task:", err)
    }
    for (const observer of task.observers) {
      if (!observer.writableEnded && !observer.destroyed) observer.end()
    }
    task.observers.clear()
    tasks.delete(task.id)
  }

  const observeTask = (task: ChatTask, res: any, fromSeq = 0) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")

    for (const event of task.events.slice(fromSeq)) {
      writeSse(res, event)
    }

    if (task.status !== "running") {
      res.end()
      return Promise.resolve()
    }

    task.observers.add(res)
    return new Promise<void>((resolve) => {
      const cleanup = () => {
        task.observers.delete(res)
        resolve()
      }
      res.on("close", cleanup)
      res.on("finish", cleanup)
    })
  }

  const startTask = async (task: ChatTask, params: {
    request: any
    workspace: any
    bundleDir: string
    adapter: any
  }) => {
    try {
      const skill = await deps.skillStore.get(params.request.command)
      await params.adapter.run({
        request: params.request,
        workspace: params.workspace,
        bundleDir: params.bundleDir,
        skill,
        sessionStore: deps.sessionStore,
        signal: task.abortController.signal,
        onChunk: (chunk: any) => {
          if (chunk.type === "text") {
            task.assistantContent += chunk.content
          }
          if (chunk.type === "opencode_session_id") {
            deps.sessionStore.updateOpencodeSessionId(task.sessionId, chunk.content).catch((err: any) => {
              console.error("Failed to update opencode session id:", err)
            })
            return
          }
          emitTaskEvent(task, chunk)
        }
      })
      const finalStatus: TaskStatus = task.stopRequested || task.abortController.signal.aborted ? "stopped" : "completed"
      emitTaskEvent(task, { type: "done", content: finalStatus === "stopped" ? "已停止" : "" })
      await finishTask(task, finalStatus)
    } catch (err: any) {
      console.error("Agent process execution error:", err)
      emitTaskEvent(task, { type: "error", content: err.message })
      await finishTask(task, "error")
    }
  }

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
      let conversationMessages: ChatMessage[] = []
      if (sessionId) {
        const existing = await deps.sessionStore.get(sessionId)
        if (!existing || existing.workspaceId !== request.workspaceId) {
          res.status(404).json({ error: "Session not found or workspace mismatch" })
          return
        }
        if (existing.runningTaskId && tasks.has(existing.runningTaskId)) {
          res.status(409).json({ error: "Session already has a running task", taskId: existing.runningTaskId })
          return
        }
        conversationMessages = [...(existing.messages || [])]
        // 续问时同步更新配置参数到 SessionStore
        await deps.sessionStore.updateConfig(sessionId, {
          agent: request.agent,
          model: request.model,
          effort: request.effort,
          permissionMode: request.permissionMode
        })
      } else {
        // 首问时传入当前配置参数进行持久化
        const session = await deps.sessionStore.create(request.workspaceId, undefined, {
          agent: request.agent,
          model: request.model,
          effort: request.effort,
          permissionMode: request.permissionMode
        })
        sessionId = session.id
        request.sessionId = sessionId
        const title = request.page.title || "新会话"
        await deps.sessionStore.updateTitle(sessionId, title)
      }

      // 持久化用户消息
      for (const msg of request.messages) {
        await deps.sessionStore.appendMessage(sessionId, msg)
      }
      const confirmedSessionId = sessionId!

      const contextSessionId = crypto.randomUUID()
      const bundleDir = await writeContextBundle(workspace.rootPath, contextSessionId, request.page, conversationMessages)
      await deps.sessionStore.addContextBundleDir(confirmedSessionId, bundleDir)

      const adapter = deps.agentRegistry.get(request.agent)
      if (!adapter) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
        res.write(`data: ${JSON.stringify({ type: "error", content: `agent not found: ${request.agent}` })}\n\n`)
        res.end()
        return
      }

      const task: ChatTask = {
        id: crypto.randomUUID(),
        sessionId: confirmedSessionId,
        workspaceId: request.workspaceId,
        events: [],
        observers: new Set(),
        abortController: new AbortController(),
        status: "running",
        assistantContent: "",
        hasPersisted: false,
        stopRequested: false,
      }
      tasks.set(task.id, task)
      await deps.sessionStore.updateRunningTask?.(confirmedSessionId, task.id, "running")

      emitTaskEvent(task, { type: "meta", sessionId: confirmedSessionId, workspaceId: request.workspaceId, taskId: task.id })
      emitTaskEvent(task, { type: "status", content: `bundle ready: ${bundleDir}` })

      void startTask(task, { request, workspace, bundleDir, adapter })
      await observeTask(task, res)
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

  router.get("/tasks/:taskId/stream", async (req, res) => {
    const task = tasks.get(req.params.taskId)
    if (!task || task.status !== "running") {
      await deps.sessionStore.clearRunningTaskByTaskId?.(req.params.taskId)
      res.status(404).json({ error: "Task not found" })
      return
    }
    const fromSeq = typeof req.query.from === "string" ? Number(req.query.from) : 0
    await observeTask(task, res, Number.isFinite(fromSeq) && fromSeq > 0 ? fromSeq : 0)
  })

  router.post("/tasks/:taskId/stop", async (req, res) => {
    const task = tasks.get(req.params.taskId)
    if (!task) {
      await deps.sessionStore.clearRunningTaskByTaskId?.(req.params.taskId)
      res.status(404).json({ error: "Task not found" })
      return
    }
    task.stopRequested = true
    await deps.sessionStore.updateRunningTask?.(task.sessionId, task.id, "stopping")
    emitTaskEvent(task, { type: "status", content: "正在停止..." })
    task.abortController.abort()
    res.json({ ok: true, taskId: task.id })
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
          return
        } catch (err: any) {
          console.error("Failed to run codex debug models:", err)
          res.json([
            { id: "default", name: "默认模型 (Auto)", hasReasoning: false },
            { id: "gpt-4o", name: "GPT-4o", hasReasoning: false },
            { id: "gpt-4o-mini", name: "GPT-4o Mini", hasReasoning: false },
            { id: "o1", name: "o1", hasReasoning: true },
            { id: "o3-mini", name: "o3-mini", hasReasoning: true }
          ])
          return
        }
      }

      if (agent === "opencode") {
        const { exec } = await import("node:child_process")
        const { promisify } = await import("node:util")
        const execAsync = promisify(exec)
        
        try {
          const bin = process.env.OPENCODE_BIN || OPENCODE_BIN || "opencode"
          const { stdout } = await execAsync(`${bin} models`, { maxBuffer: 10 * 1024 * 1024 })
          const lines = stdout.split("\n").map(l => l.trim()).filter(Boolean)
          const mapped = lines.map((line) => {
            const isReasoning = line.includes("reasoner") || line.includes("pro") || line.includes("max")
            return {
              id: line,
              name: line,
              hasReasoning: isReasoning
            }
          })
          res.json(mapped)
          return
        } catch (err) {
          console.error("Failed to run opencode models:", err)
          res.json([
            { id: "default", name: "默认模型 (Auto)", hasReasoning: true },
            { id: "opencode-go/deepseek-v4-pro", name: "deepseek-v4-pro", hasReasoning: true },
            { id: "opencode-go/qwen3.7-max", name: "qwen3.7-max", hasReasoning: true }
          ])
          return
        }
      }

      if (agent === "antigravity") {
        res.json([
          { id: "default", name: "默认模型 (Gemini 3.5 Flash)", hasReasoning: true },
          { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", hasReasoning: true },
          { id: "gemini-3.5-pro", name: "Gemini 3.5 Pro", hasReasoning: true },
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", hasReasoning: false }
        ])
        return
      }

      // 默认情况或 agent === "claude-code"
      res.json([
        { id: "default", name: "默认模型 (Sonnet 4.6)", hasReasoning: true },
        { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", hasReasoning: true },
        { id: "claude-opus-4-8", name: "Claude Opus 4.8", hasReasoning: true },
        { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", hasReasoning: false },
        { id: "claude-fable-5", name: "Claude Fable 5", hasReasoning: true }
      ])
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.use("/api/chat", router)
}
