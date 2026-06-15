import { spawn } from "node:child_process"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { CLAUDE_BIN, CLAUDE_ARGS } from "../config"

function streamProcess(
  command: string,
  args: string[],
  cwd: string,
  prompt: string,
  onText: (text: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
    
    child.stdin.write(prompt)
    child.stdin.end()

    child.stdout.on("data", (chunk) => onText(chunk.toString()))
    
    let stderrBuffer = ""
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString()
      stderrBuffer += text
      onText(text)
    })

    child.on("close", (code) => {
      if (code === 0) {
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
  async run({ workspace, bundleDir, request, skill, onChunk, sessionStore }: AgentRunOptions) {
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
      await streamProcess(bin, args, workspace.rootPath, prompt, (text) => {
        onChunk({ type: "text", content: text })
      })
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
        await streamProcess(bin, fallbackArgs, workspace.rootPath, prompt, (text) => {
          onChunk({ type: "text", content: text })
        })
      } else {
        throw err
      }
    }
  }
}
