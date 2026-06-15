import { spawn } from "node:child_process"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { CODEX_BIN, CODEX_ARGS } from "../config"

function streamProcessCodex(
  command: string,
  args: string[],
  cwd: string,
  prompt: string,
  onChunk: (chunk: any) => void,
  onThreadStarted: (threadId: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
    
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
          if (event.type === "thread.started" && event.thread_id) {
            onThreadStarted(event.thread_id)
          } else if (event.type === "text" && event.content) {
            onChunk({ type: "text", content: event.content })
          } else if (event.type === "error" && event.message) {
            onChunk({ type: "error", content: event.message })
          } else if (event.type === "turn.failed" && event.error?.message) {
            onChunk({ type: "error", content: event.error.message })
          }
        } catch {
          onChunk({ type: "text", content: trimmed + "\n" })
        }
      }
    })

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString()
      if (text.toLowerCase().includes("error:")) {
        onChunk({ type: "error", content: text.trim() })
      } else {
        onChunk({ type: "text", content: text })
      }
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Codex process exited with code ${code}`))
      }
    })

    child.on("error", reject)
  })
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
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

    let codexThreadId: string | undefined
    if (request.sessionId && sessionStore) {
      const existing = await sessionStore.get(request.sessionId)
      if (existing) {
        codexThreadId = existing.codexThreadId
      }
    }

    const bin = process.env.CODEX_BIN || CODEX_BIN
    
    const options: string[] = []
    
    // 拼入前端指定的 effort 思考参数
    if (request.effort) {
      options.push("-c", `model_options.reasoning_effort=${request.effort}`)
    }

    if (request.permissionMode === "full") {
      options.push("--dangerously-bypass-approvals-and-sandbox")
    }

    let args: string[] = []
    if (codexThreadId) {
      args = ["exec", "resume", ...options, codexThreadId, "--skip-git-repo-check", "--json", "-"]
    } else {
      args = ["exec", ...options, "--skip-git-repo-check", "--json", "-"]
    }

    await streamProcessCodex(
      bin,
      args,
      workspace.rootPath,
      prompt,
      onChunk,
      (threadId) => {
        if (request.sessionId && sessionStore) {
          sessionStore.updateCodexThreadId(request.sessionId, threadId).catch((err: any) => {
            console.error("Failed to update codex thread id:", err)
          })
        }
      }
    )
  }
}
