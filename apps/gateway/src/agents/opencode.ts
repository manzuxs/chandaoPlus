import { spawn } from "node:child_process"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { OPENCODE_BIN, OPENCODE_ARGS } from "../config"

function streamProcessOpencode(
  command: string,
  args: string[],
  cwd: string,
  prompt: string,
  onChunk: (chunk: any) => void
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
          if (event.type === "text" && event.part && event.part.text) {
            onChunk({ type: "text", content: event.part.text })
          } else if (event.type === "step_start") {
            onChunk({ type: "status", content: "开始运行..." })
          } else if (event.type === "error") {
            const msg = event.error?.message || event.error?.data?.message || "Unknown error"
            onChunk({ type: "error", content: msg })
          }
        } catch {
          onChunk({ type: "text", content: trimmed + "\n" })
        }
      }
    })

    let stderrBuffer = ""
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString()
      stderrBuffer += text
      console.error(`[OpenCode Stderr] ${text.trim()}`)
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`OpenCode process exited with code ${code}. Stderr: ${stderrBuffer}`))
      }
    })

    child.on("error", reject)
  })
}

export const opencodeAdapter: AgentAdapter = {
  id: "opencode",
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
    if (request.permissionMode === "full" && !args.includes("--dangerously-skip-permissions")) {
      args.push("--dangerously-skip-permissions")
    }

    let sessionIdArg = ""
    if (request.sessionId) {
      sessionIdArg = request.sessionId.startsWith("ses")
        ? request.sessionId
        : `ses_${request.sessionId}`
      args.push("--session", sessionIdArg)
    }

    if (request.model && request.model !== "default") {
      args.push("--model", request.model)
    }

    if (request.effort) {
      args.push("--variant", request.effort)
    }

    try {
      await streamProcessOpencode(bin, args, workspace.rootPath, prompt, onChunk)
    } catch (err: any) {
      const isSession = args.includes("--session")
      const isSessionNotFoundError = err.message.includes("Session not found") || err.message.includes("not found")
      
      if (isSession && isSessionNotFoundError) {
        console.warn(`[OpenCode] Session ${request.sessionId} not found. Falling back without session parameter.`)
        const fallbackArgs = args.filter(a => a !== "--session" && a !== sessionIdArg)
        await streamProcessOpencode(bin, fallbackArgs, workspace.rootPath, prompt, onChunk)
      } else {
        throw err
      }
    }
  }
}
