import { spawn, execSync } from "node:child_process"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { OPENCODE_BIN, OPENCODE_ARGS } from "../config"

function getSystemProxy(): { http?: string; socks?: string } | null {
  if (process.platform !== "darwin") return null
  try {
    const stdout = execSync("scutil --proxy").toString()
    const httpEnabled = stdout.includes("HTTPEnable : 1") || stdout.includes("HTTPSEnable : 1")
    const socksEnabled = stdout.includes("SOCKSEnable : 1")
    
    const res: { http?: string; socks?: string } = {}
    
    if (httpEnabled) {
      const proxyMatch = stdout.match(/HTTPProxy\s*:\s*(\S+)/)
      const portMatch = stdout.match(/HTTPPort\s*:\s*(\d+)/)
      if (proxyMatch && portMatch) {
        res.http = `http://${proxyMatch[1]}:${portMatch[1]}`
      }
    }
    
    if (socksEnabled) {
      const proxyMatch = stdout.match(/SOCKSProxy\s*:\s*(\S+)/)
      const portMatch = stdout.match(/SOCKSPort\s*:\s*(\d+)/)
      if (proxyMatch && portMatch) {
        res.socks = `socks5://${proxyMatch[1]}:${portMatch[1]}`
      }
    }
    
    return res
  } catch {
    return null
  }
}

function streamProcessOpencode(
  command: string,
  args: string[],
  cwd: string,
  prompt: string,
  env: Record<string, string | undefined>,
  onChunk: (chunk: any) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] })
    
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
          // 捕获 OpenCode 真实 sessionID（每个事件都携带），用于后续续问
          if (event.sessionID && typeof event.sessionID === "string") {
            onChunk({ type: "opencode_session_id", content: event.sessionID })
          }
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

    const proxyConfig = getSystemProxy()
    const env = { ...process.env }
    if (proxyConfig) {
      if (proxyConfig.http) {
        env.HTTP_PROXY = process.env.HTTP_PROXY || proxyConfig.http
        env.HTTPS_PROXY = process.env.HTTPS_PROXY || proxyConfig.http
        env.http_proxy = process.env.http_proxy || proxyConfig.http
        env.https_proxy = process.env.https_proxy || proxyConfig.http
      }
      if (proxyConfig.socks) {
        env.ALL_PROXY = process.env.ALL_PROXY || proxyConfig.socks
        env.all_proxy = process.env.all_proxy || proxyConfig.socks
      }
    }

    await streamProcessOpencode(bin, args, workspace.rootPath, prompt, env, onChunk)
  }
}
