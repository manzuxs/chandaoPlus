import { spawnWithCleanup } from "./process-cleanup"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { QCODE_BIN, QCODE_ARGS } from "../config"

function logAgentChunk(agent: string, chunk: { type: string; content?: string }) {
  const content = chunk.content ?? ""
  console.log(`[${agent} ${chunk.type}] ${content}`)
}

function streamProcess(
  command: string,
  args: string[],
  cwd: string,
  prompt: string,
  onChunk: (chunk: any) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return resolve()
    }
    const env = {
      ...process.env,
      HTTP_TIMEOUT: "600000",
      API_TIMEOUT: "600000",
      TIMEOUT: "600000",
      GEMINI_API_TIMEOUT: "600000",
      CLAUDE_API_TIMEOUT: "600000"
    }
    const child = spawnWithCleanup(command, args, { cwd, env }, signal)

    child.stdin.write(prompt)
    child.stdin.end()

    let stdoutBuffer = ""
    let textBuffer = ""
    let lastThinkingLogTime = 0
    let lastActionStatusTime = 0

    const isActionContent = (content: string): boolean => {
      return content.includes("正在修改") || 
             content.includes("正在阅读") || 
             content.includes("正在执行") || 
             content.includes("正在搜索") || 
             content.includes("正在使用工具")
    }

    const onChunkWithLock = (chunk: any) => {
      if (chunk.type === "status") {
        if (isActionContent(chunk.content)) {
          lastActionStatusTime = Date.now()
          onChunk(chunk)
        } else if (chunk.content === "思考中...") {
          const elapsed = Date.now() - lastActionStatusTime
          if (elapsed < 1500) {
            return
          }
          onChunk(chunk)
        } else {
          onChunk(chunk)
        }
      } else {
        onChunk(chunk)
      }
    }

    const logAgentText = (text: string) => {
      textBuffer += text
      const lines = textBuffer.split("\n")
      textBuffer = lines.pop() || ""
      for (const line of lines) {
        logAgentChunk("Qcode", { type: "text", content: line })
      }
    }

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split("\n")
      stdoutBuffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const event = JSON.parse(trimmed)
          if (event.type === "stream_event") {
            const innerEvent = event.event
            if (innerEvent) {
              if (innerEvent.type === "content_block_start" && innerEvent.content_block) {
                const block = innerEvent.content_block
                if (block.type === "tool_use" && block.name) {
                  const toolName = block.name
                  const toolInput = block.input || {}
                  const rawPath = toolInput.path || toolInput.filePath || toolInput.file || toolInput.target || ""
                  const targetPath = typeof rawPath === "string" ? rawPath.trim() : ""
                  const rawCmd = toolInput.command || toolInput.cmd || ""
                  const targetCmd = typeof rawCmd === "string" ? rawCmd.trim() : ""

                  let statusText = `正在使用工具: ${toolName}...`
                  if (toolName.includes("write") || toolName.includes("edit") || toolName.includes("replace") || toolName.includes("patch")) {
                    statusText = targetPath ? `正在修改文件: ${targetPath}...` : "正在修改代码..."
                  } else if (toolName.includes("read") || toolName.includes("view") || toolName.includes("show")) {
                    statusText = targetPath ? `正在阅读文件: ${targetPath}...` : "正在阅读文件..."
                  } else if (toolName.includes("bash") || toolName.includes("execute") || toolName.includes("run") || toolName.includes("cmd")) {
                    statusText = targetCmd ? `正在执行命令: ${targetCmd}...` : "正在执行终端命令..."
                  } else if (toolName.includes("glob") || toolName.includes("find") || toolName.includes("search")) {
                    statusText = targetPath ? `正在搜索目录: ${targetPath}...` : "正在搜索文件..."
                  }
                  logAgentChunk("Qcode", { type: "status", content: statusText })
                  onChunkWithLock({ type: "status", content: statusText })
                }
              }
              if (innerEvent.type === "content_block_delta" && innerEvent.delta) {
                if (innerEvent.delta.type === "text_delta" && innerEvent.delta.text) {
                  logAgentText(innerEvent.delta.text)
                  onChunkWithLock({ type: "text", content: innerEvent.delta.text })
                } else if (innerEvent.delta.type === "thinking_delta" && innerEvent.delta.thinking) {
                  onChunkWithLock({ type: "thinking", content: innerEvent.delta.thinking })
                  const now = Date.now()
                  if (now - lastThinkingLogTime > 2000) {
                    lastThinkingLogTime = now
                    logAgentChunk("Qcode", { type: "status", content: "思考中..." })
                    onChunkWithLock({ type: "status", content: "思考中..." })
                  }
                }
              }
            }
          } else if (event.type === "progress" && event.content) {
            logAgentChunk("Qcode", { type: "status", content: event.content })
            onChunkWithLock({ type: "status", content: event.content })
          } else if (event.type === "error" && event.message) {
            logAgentChunk("Qcode", { type: "error", content: event.message })
            onChunkWithLock({ type: "error", content: event.message })
          } else if (event.type === "assistant" && event.message) {
            const msg = event.message
            if (msg.delta) {
              if (msg.delta.text) {
                logAgentText(msg.delta.text)
                onChunkWithLock({ type: "text", content: msg.delta.text })
              }
              if (msg.delta.thinking) {
                onChunkWithLock({ type: "thinking", content: msg.delta.thinking })
                const now = Date.now()
                if (now - lastThinkingLogTime > 2000) {
                  lastThinkingLogTime = now
                  logAgentChunk("Qcode", { type: "status", content: "思考中..." })
                  onChunkWithLock({ type: "status", content: "思考中..." })
                }
              }
            }
          }
        } catch {
          logAgentText(trimmed + "\n")
          onChunkWithLock({ type: "text", content: trimmed + "\n" })
        }
      }
    })
    
    let stderrBuffer = ""
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString()
      stderrBuffer += text
      console.error(`[Qcode Stderr] ${text.trim()}`)
    })

    child.on("close", (code) => {
      if (textBuffer) {
        logAgentChunk("Qcode", { type: "text", content: textBuffer })
      }
      if (signal?.aborted) {
        resolve()
      } else if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Process exited with code ${code}. Stderr: ${stderrBuffer}`))
      }
    })

    child.on("error", reject)
  })
}

export const qcodeAdapter: AgentAdapter = {
  id: "qcode",
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

    console.log("=== [Qcode Agent Prompt] ===")
    console.log(prompt)
    console.log("==================================")
    const bin = process.env.QCODE_BIN || QCODE_BIN
    const rawArgs = process.env.QCODE_ARGS || QCODE_ARGS
    const args = rawArgs.split(/\s+/).filter(Boolean)

    if (!args.includes("--print") && !args.includes("-p")) {
      args.push("--print")
    }
    if (!args.includes("--output-format")) {
      args.push("--output-format", "stream-json")
    }
    if (!args.includes("--include-partial-messages")) {
      args.push("--include-partial-messages")
    }

    if (request.sessionId && sessionStore) {
      const existing = await sessionStore.get(request.sessionId)
      const isFirstQuery = !existing || !existing.messages || existing.messages.length <= 1
      if (isFirstQuery) {
        args.push("--session-id", request.sessionId)
      } else {
        args.push("--resume", request.sessionId)
      }
    }

    if (request.effort) {
      args.push("--reasoning-effort", request.effort)
    }

    if (request.model && request.model !== "default") {
      args.push("--model", request.model)
    }

    if (request.permissionMode === "full") {
      args.push("--dangerously-skip-permissions")
    } else {
      args.push("--permission-mode", "default")
    }

    try {
      await streamProcess(bin, args, workspace.rootPath, prompt, onChunk, signal)
    } catch (err: any) {
      const isResume = args.includes("--resume")
      const isSessionNotFoundError = err.message.includes("No conversation found") || err.message.includes("Invalid session identifier")
      
      if (isResume && isSessionNotFoundError) {
        console.warn(`[Qcode] Session ${request.sessionId} not found on disk. Falling back to init mode.`)
        const fallbackArgs: string[] = []
        for (let i = 0; i < args.length; i++) {
          if (args[i] === "--resume") {
            fallbackArgs.push("--session-id")
          } else {
            fallbackArgs.push(args[i])
          }
        }
        await streamProcess(bin, fallbackArgs, workspace.rootPath, prompt, onChunk, signal)
      } else {
        throw err
      }
    }
  }
}
