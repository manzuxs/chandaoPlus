import { spawnWithCleanup } from "./process-cleanup"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { ANTIGRAVITY_BIN, ANTIGRAVITY_ARGS } from "../config"

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
        logAgentChunk("Antigravity", { type: "text", content: line })
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
                  logAgentChunk("Antigravity", { type: "status", content: statusText })
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
                    logAgentChunk("Antigravity", { type: "status", content: "思考中..." })
                    onChunkWithLock({ type: "status", content: "思考中..." })
                  }
                }
              }
            }
          } else if (event.type === "progress" && event.content) {
            logAgentChunk("Antigravity", { type: "status", content: event.content })
            onChunkWithLock({ type: "status", content: event.content })
          } else if (event.type === "error" && event.message) {
            logAgentChunk("Antigravity", { type: "error", content: event.message })
            onChunkWithLock({ type: "error", content: event.message })
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
      console.error(`[Antigravity Stderr] ${text.trim()}`)
    })

    child.on("close", (code) => {
      if (textBuffer) {
        logAgentChunk("Antigravity", { type: "text", content: textBuffer })
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

export const antigravityAdapter: AgentAdapter = {
  id: "antigravity",
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

    console.log("=== [Antigravity Agent Prompt] ===")
    console.log(prompt)
    console.log("==================================")
    const bin = process.env.ANTIGRAVITY_BIN || ANTIGRAVITY_BIN
    const rawArgs = process.env.ANTIGRAVITY_ARGS || ANTIGRAVITY_ARGS
    const args = rawArgs.split(/\s+/).filter(Boolean)

    // 确保与 Claude Code 类似的流式输出选项可用
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

    // 拼入前端指定的 effort 思考参数
    if (request.effort) {
      args.push("--effort", request.effort)
    }

    // 拼入前端指定的 model 参数
    if (request.model && request.model !== "default") {
      args.push("--model", request.model)
    }

    // 拼入前端指定的权限审批标志
    if (request.permissionMode === "full") {
      args.push("--permission-mode", "bypassPermissions")
    } else {
      args.push("--permission-mode", "plan")
    }

    try {
      await streamProcess(bin, args, workspace.rootPath, prompt, onChunk, signal)
    } catch (err: any) {
      if (err.code === "ENOENT" || err.message.includes("ENOENT")) {
        throw new Error(`未检测到本地 agy 命令行工具，请检查 PATH 或 ANTIGRAVITY_BIN 环境变量。`)
      }

      const isResume = args.includes("--resume")
      const isSessionNotFoundError = err.message.includes("No conversation found")
      
      if (isResume && isSessionNotFoundError) {
        console.warn(`[Antigravity] Session ${request.sessionId} not found on disk. Falling back to init mode.`)
        // 降级重新运行
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
