import { spawn } from "node:child_process"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { CLAUDE_BIN, CLAUDE_ARGS } from "../config"

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
              if (innerEvent.type === "content_block_delta" && innerEvent.delta) {
                if (innerEvent.delta.type === "text_delta" && innerEvent.delta.text) {
                  logAgentChunk("Claude Code", { type: "text", content: innerEvent.delta.text })
                  onChunk({ type: "text", content: innerEvent.delta.text })
                } else if (innerEvent.delta.type === "thinking_delta" && innerEvent.delta.thinking) {
                  logAgentChunk("Claude Code", { type: "status", content: "思考中..." })
                  onChunk({ type: "status", content: "思考中..." })
                }
              }
            }
          } else if (event.type === "progress" && event.content) {
            logAgentChunk("Claude Code", { type: "status", content: event.content })
            onChunk({ type: "status", content: event.content })
          } else if (event.type === "error" && event.message) {
            logAgentChunk("Claude Code", { type: "error", content: event.message })
            onChunk({ type: "error", content: event.message })
          }
        } catch {
          logAgentChunk("Claude Code", { type: "text", content: trimmed + "\n" })
          onChunk({ type: "text", content: trimmed + "\n" })
        }
      }
    })
    
    let stderrBuffer = ""
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString()
      stderrBuffer += text
      console.error(`[Claude Code Stderr] ${text.trim()}`)
    })

    child.on("close", (code) => {
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

export const claudeCodeAdapter: AgentAdapter = {
  id: "claude-code",
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
    })

    console.log("=== [Claude Code Agent Prompt] ===")
    console.log(prompt)
    console.log("==================================")
    const bin = process.env.CLAUDE_BIN || CLAUDE_BIN
    const rawArgs = process.env.CLAUDE_ARGS || CLAUDE_ARGS
    const args = rawArgs.split(/\s+/).filter(Boolean)

    // Ensure we have printing and stream-json output options enabled
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
        console.warn(`[Claude Code] Session ${request.sessionId} not found on disk. Falling back to init mode.`)
        // 降级重新运行：将 --resume 替换为 --session-id，新启动会话
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
