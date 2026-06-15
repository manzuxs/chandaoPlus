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
    child.stderr.on("data", (chunk) => onText(chunk.toString()))

    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Process exited with code ${code}`))
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
    })
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

    await streamProcess(bin, args, workspace.rootPath, prompt, (text) => {
      onChunk({ type: "text", content: text })
    })
  }
}
