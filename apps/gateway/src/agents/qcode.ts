import { spawn } from "node:child_process"
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
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
    signal?.addEventListener("abort", () => {
      child.kill("SIGTERM")
    }, { once: true })
    
    child.stdin.write(prompt)
    child.stdin.end()

    let stdoutBuffer = ""
    let textBuffer = ""
    let lastThinkingLogTime = 0
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
                  onChunk({ type: "status", content: statusText })
                }
              }
              if (innerEvent.type === "content_block_delta" && innerEvent.delta) {
                if (innerEvent.delta.type === "text_delta" && innerEvent.delta.text) {
                  logAgentText(innerEvent.delta.text)
                  onChunk({ type: "text", content: innerEvent.delta.text })
                } else if (innerEvent.delta.type === "thinking_delta" && innerEvent.delta.thinking) {
                  const now = Date.now()
                  if (now - lastThinkingLogTime > 2000) {
                    lastThinkingLogTime = now
                    logAgentChunk("Qcode", { type: "status", content: "思考中..." })
                    onChunk({ type: "status", content: "思考中..." })
                  }
                }
              }
            }
          } else if (event.type === "progress" && event.content) {
            logAgentChunk("Qcode", { type: "status", content: event.content })
            onChunk({ type: "status", content: event.content })
          } else if (event.type === "error" && event.message) {
            logAgentChunk("Qcode", { type: "error", content: event.message })
            onChunk({ type: "error", content: event.message })
          }
        } catch {
          logAgentText(trimmed + "\n")
          onChunk({ type: "text", content: trimmed + "\n" })
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
    const prompt = buildPrompt({
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
    if (!args.includes("--verbose")) {
      args.push("--verbose")
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
      args.push("--effort", request.effort)
    }

    if (request.model && request.model !== "default") {
      args.push("--model", request.model)
    }

    if (request.permissionMode && request.permissionMode !== "custom") {
      if (request.permissionMode === "ask") {
        args.push("--permission-mode", "plan")
      } else if (request.permissionMode === "auto") {
        args.push("--permission-mode", "auto")
      } else if (request.permissionMode === "full") {
        args.push("--permission-mode", "bypassPermissions")
      }
    }

    try {
      await streamProcess(bin, args, workspace.rootPath, prompt, onChunk, signal)
    } catch (err: any) {
      const isResume = args.includes("--resume")
      const isSessionNotFoundError = err.message.includes("No conversation found")
      
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
