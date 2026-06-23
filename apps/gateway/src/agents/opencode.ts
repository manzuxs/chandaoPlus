import { spawn } from "node:child_process"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { OPENCODE_BIN, OPENCODE_ARGS } from "../config"

function logAgentChunk(agent: string, chunk: { type: string; content?: string }) {
  const content = chunk.content ?? ""
  console.log(`[${agent} ${chunk.type}] ${content}`)
}

function summarizeOpenCodeEvent(event: any): string {
  const summary = {
    sessionID: event.sessionID,
    partType: event.part?.type,
    reason: event.part?.reason,
    tool: event.part?.tool,
  }
  return JSON.stringify(summary)
}

function streamProcessOpencode(
  command: string,
  args: string[],
  cwd: string,
  prompt: string,
  env: Record<string, string | undefined>,
  onChunk: (chunk: any) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return resolve()
    }
    const startedAt = Date.now()
    let lastActivityAt = startedAt
    let stdoutBytes = 0
    let stderrBytes = 0
    let textChunks = 0
    const eventCounts: Record<string, number> = {}
    let textBuffer = ""
    const logAgentText = (text: string) => {
      textBuffer += text
      const lines = textBuffer.split("\n")
      textBuffer = lines.pop() || ""
      for (const line of lines) {
        logAgentChunk("OpenCode", { type: "text", content: line })
      }
    }
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] })
    console.log(`[OpenCode start] pid=${child.pid ?? "unknown"} cwd=${cwd} command=${command} args=${JSON.stringify(args)}`)
    const heartbeat = setInterval(() => {
      const idleMs = Date.now() - lastActivityAt
      const elapsedMs = Date.now() - startedAt
      console.log(`[OpenCode heartbeat] pid=${child.pid ?? "unknown"} elapsedMs=${elapsedMs} idleMs=${idleMs} stdoutBytes=${stdoutBytes} stderrBytes=${stderrBytes} textChunks=${textChunks} events=${JSON.stringify(eventCounts)}`)
    }, 15000)
    signal?.addEventListener("abort", () => {
      console.log(`[OpenCode abort] pid=${child.pid ?? "unknown"}`)
      child.kill("SIGTERM")
    }, { once: true })
    
    child.stdin.write(prompt)
    child.stdin.end()
 
    const parseStdoutLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const event = JSON.parse(trimmed)
        lastActivityAt = Date.now()
        eventCounts[event.type] = (eventCounts[event.type] || 0) + 1
        // 捕获 OpenCode 真实 sessionID（每个事件都携带），用于后续续问
        if (event.sessionID && typeof event.sessionID === "string") {
          onChunk({ type: "opencode_session_id", content: event.sessionID })
        }
        if (event.type === "text" && event.part && event.part.text) {
          textChunks += 1
          logAgentText(event.part.text)
          onChunk({ type: "text", content: event.part.text })
        } else if (event.type === "step_start") {
          console.log(`[OpenCode event] ${event.type} 会话：${event.sessionID || "无"}，事件：步骤启动...`)
          const startCount = eventCounts["step_start"] || 0
          if (startCount === 1) {
            logAgentChunk("OpenCode", { type: "status", content: "开始运行..." })
            onChunk({ type: "status", content: "开始运行..." })
          }
        } else if (event.part?.type === "tool" && event.part?.tool) {
          const toolName = event.part.tool
          const toolInput = event.part.input || event.part.arguments || {}
          
          const rawPath = toolInput.path || toolInput.filePath || toolInput.file || ""
          const targetPath = typeof rawPath === "string" ? rawPath.trim() : ""
          
          const rawCmd = toolInput.command || toolInput.cmd || ""
          const targetCmd = typeof rawCmd === "string" ? rawCmd.trim() : ""

          let statusText = `正在使用工具: ${toolName}...`
          if (toolName === "edit") {
            statusText = targetPath ? `正在修改文件: ${targetPath}...` : "正在修改代码..."
          } else if (toolName === "read") {
            statusText = targetPath ? `正在阅读文件: ${targetPath}...` : "正在阅读文件..."
          } else if (toolName === "bash") {
            statusText = targetCmd ? `正在执行命令: ${targetCmd}...` : "正在执行终端命令..."
          } else if (toolName === "glob") {
            statusText = targetPath ? `正在搜索目录: ${targetPath}...` : "正在搜索文件..."
          }
          
          console.log(`[OpenCode event] ${event.type} 会话：${event.sessionID || "无"}，事件：${statusText}`)
          logAgentChunk("OpenCode", { type: "status", content: statusText })
          onChunk({ type: "status", content: statusText })
        } else if (event.type === "error") {
          const msg = event.error?.message || event.error?.data?.message || "Unknown error"
          logAgentChunk("OpenCode", { type: "error", content: msg })
          onChunk({ type: "error", content: msg })
        } else {
          const reasonText = event.part?.reason ? ` (${event.part.reason})` : ""
          console.log(`[OpenCode event] ${event.type} 会话：${event.sessionID || "无"}，事件：${event.type}${reasonText}`)
        }
      } catch {
        lastActivityAt = Date.now()
        logAgentText(trimmed + "\n")
        onChunk({ type: "text", content: trimmed + "\n" })
      }
    }

    let stdoutBuffer = ""
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString()
      stdoutBytes += Buffer.byteLength(text)
      lastActivityAt = Date.now()
      stdoutBuffer += text
      const lines = stdoutBuffer.split("\n")
      stdoutBuffer = lines.pop() || ""
 
      for (const line of lines) {
        parseStdoutLine(line)
      }
    })
 
    let stderrBuffer = ""
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString()
      stderrBytes += Buffer.byteLength(text)
      lastActivityAt = Date.now()
      stderrBuffer += text
      console.error(`[OpenCode Stderr] ${text.trim()}`)
    })
 
    child.on("close", (code) => {
      clearInterval(heartbeat)
      if (stdoutBuffer.trim()) {
        parseStdoutLine(stdoutBuffer)
        stdoutBuffer = ""
      }
      if (textBuffer) {
        logAgentChunk("OpenCode", { type: "text", content: textBuffer })
      }
      console.log(`[OpenCode close] code=${code} signalAborted=${signal?.aborted ? "yes" : "no"} elapsedMs=${Date.now() - startedAt} stdoutBytes=${stdoutBytes} stderrBytes=${stderrBytes} textChunks=${textChunks} events=${JSON.stringify(eventCounts)}`)
      if (signal?.aborted) {
        resolve()
      } else if (code === 0) {
        resolve()
      } else {
        reject(new Error(`OpenCode process exited with code ${code}. Stderr: ${stderrBuffer}`))
      }
    })
 
    child.on("error", (err) => {
      clearInterval(heartbeat)
      console.error(`[OpenCode process error] ${err.message}`)
      reject(err)
    })
  })
}

export const opencodeAdapter: AgentAdapter = {
  id: "opencode",
  async run({ workspace, bundleDir, request, skill, onChunk, sessionStore, signal }: AgentRunOptions) {
    const prompt = await buildPrompt({
      command: request.command,
      workspaceRoot: workspace.rootPath,
      bundleDir,
      messages: request.messages,
      pageTitle: request.page.title,
      pageUrl: request.page.url,
      skill,
      page: request.page,
      requiredFiles: workspace.requiredFiles,
    })

    console.log("=== [OpenCode Agent Prompt] ===")
    console.log(prompt)
    console.log("================================")

    const bin = process.env.OPENCODE_BIN || OPENCODE_BIN
    const rawArgs = process.env.OPENCODE_ARGS || OPENCODE_ARGS
    const args = rawArgs.split(/\s+/).filter(Boolean)

    // Ensure format is JSON and skipping approvals when specified
    if (!args.includes("--format")) {
      args.push("--format", "json")
    }
    if (!args.includes("--pure")) {
      args.push("--pure")
    }
    if (!args.includes("--dangerously-skip-permissions")) {
      args.push("--dangerously-skip-permissions")
    }

    // 从 sessionStore 读取已持久化的 OpenCode 真实 session ID
    // 绝不用我们自己的 UUID 拼接，因为 OpenCode session 是其独立进程系统
    let opencodeSessionId: string | undefined
    if (request.sessionId && sessionStore) {
      try {
        const session = await sessionStore.get(request.sessionId)
        opencodeSessionId = session?.opencodeSessionId
      } catch {
        // sessionStore 读取失败时忽略，以无 session 模式运行
      }
    }

    if (opencodeSessionId) {
      args.push("--session", opencodeSessionId)
      console.log(`[OpenCode] Continuing session: ${opencodeSessionId}`)
    }

    if (request.model && request.model !== "default") {
      args.push("--model", request.model)
    }

    if (request.effort) {
      args.push("--variant", request.effort)
    }

    const env = { ...process.env }

    await streamProcessOpencode(bin, args, workspace.rootPath, prompt, env, onChunk, signal)
  }
}
