import { spawn } from "node:child_process"
import type { ChatMessage } from "@chandaoplus/shared"
import { CLAUDE_BIN, CLAUDE_ARGS } from "../config"

export interface SummarizeOptions {
  messages: ChatMessage[]
  previousSummary?: string
  workspaceRoot: string
  signal?: AbortSignal
}

function buildSummarizationPrompt(messages: ChatMessage[], previousSummary?: string): string {
  const conversationText = messages.map((m) => {
    const role = m.role === "user" ? "用户" : m.role === "assistant" ? "助手" : "系统"
    const content = m.content.length > 8000 ? m.content.slice(0, 8000) + "\n\n[内容过长，已截断]" : m.content
    return `## ${role}\n\n${content}`
  }).join("\n\n")

  const incrementalHint = previousSummary
    ? `\n\n## 上一轮摘要\n\n${previousSummary}\n\n请基于以上摘要和新消息，更新摘要内容。`
    : ""

  return `请对以下会话历史进行结构化摘要。提取以下关键信息并用中文输出：

1. **核心任务/目标**：用户要解决什么问题
2. **重要决策**：已做出的技术决策和架构选择
3. **文件变更**：已修改的关键文件和代码变更内容
4. **遇到的问题**：过程中遇到的错误、阻塞及解决方案
5. **当前进度**：任务完成情况和下一步计划

摘要应简洁、具体，保留文件名、函数名、错误信息等技术细节，总长度不超过 1500 字。${incrementalHint}

---

${conversationText}`
}

// Whitelist of env vars safe to pass to child process
const SAFE_ENV_KEYS = new Set([
  "PATH", "HOME", "USER", "TMPDIR", "SHELL",
  "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
  "OPENAI_API_KEY", "OPENAI_BASE_URL",
  "HTTP_TIMEOUT", "NETWORK_TIMEOUT", "API_TIMEOUT",
])

function buildSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) {
      env[key] = process.env[key]
    }
  }
  return env
}

export function generateSummary(options: SummarizeOptions): Promise<string> {
  const { messages, previousSummary, workspaceRoot, signal } = options

  return new Promise((resolve, _reject) => {
    let resolved = false
    const safeResolve = (value: string) => {
      if (!resolved) {
        resolved = true
        resolve(value)
      }
    }

    const prompt = buildSummarizationPrompt(messages, previousSummary)
    const args = CLAUDE_ARGS
      ? [...CLAUDE_ARGS.split(" "), "--permission-mode", "auto"]
      : ["--print", "--permission-mode", "auto"]

    const child = spawn(CLAUDE_BIN, args, {
      cwd: workspaceRoot,
      env: buildSafeEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    })

    // Don't block Node.js process exit
    child.unref()

    let output = ""
    let errOutput = ""

    // SIGKILL fallback after SIGTERM (5s grace period)
    let sigkillTimeout: ReturnType<typeof setTimeout> | null = null
    const killChild = () => {
      child.kill("SIGTERM")
      sigkillTimeout = setTimeout(() => child.kill("SIGKILL"), 5000)
    }

    const timeout = setTimeout(() => {
      killChild()
      safeResolve(generateFallbackSummary(messages, previousSummary))
    }, 30000)

    child.stdout.on("data", (data: Buffer) => {
      output += data.toString()
    })

    child.stderr.on("data", (data: Buffer) => {
      errOutput += data.toString()
    })

    if (signal) {
      if (signal.aborted) {
        safeResolve(generateFallbackSummary(messages, previousSummary))
        return
      }
      signal.addEventListener("abort", () => {
        clearTimeout(timeout)
        if (sigkillTimeout) clearTimeout(sigkillTimeout)
        killChild()
        safeResolve(output.trim() || generateFallbackSummary(messages, previousSummary))
      }, { once: true })
    }

    child.on("close", (code) => {
      clearTimeout(timeout)
      if (sigkillTimeout) clearTimeout(sigkillTimeout)
      if (code === 0) {
        safeResolve(output.trim() || generateFallbackSummary(messages, previousSummary))
      } else {
        console.error("Summarization agent exited with code:", code, errOutput.slice(0, 500))
        safeResolve(generateFallbackSummary(messages, previousSummary))
      }
    })

    child.on("error", (err) => {
      clearTimeout(timeout)
      if (sigkillTimeout) clearTimeout(sigkillTimeout)
      console.error("Failed to spawn summarization agent:", err.message)
      safeResolve(generateFallbackSummary(messages, previousSummary))
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}

function generateFallbackSummary(messages: ChatMessage[], previousSummary?: string): string {
  const parts: string[] = []

  if (previousSummary) {
    parts.push(previousSummary)
    parts.push("\n\n(后续对话摘要由系统自动生成)")
    return parts.join("")
  }

  const firstUser = messages.find((m) => m.role === "user")
  if (firstUser) {
    parts.push(`**核心任务**：${firstUser.content.slice(0, 200)}`)
  }

  const codeBlockPattern = /```[\s\S]*?```/g
  let codeBlockCount = 0
  const fileEdits = new Set<string>()

  for (const msg of messages) {
    const codeBlocks = msg.content.match(codeBlockPattern)
    if (codeBlocks) {
      codeBlockCount += codeBlocks.length
    }
    const fileMatches = msg.content.match(/`([^`]+\.(ts|tsx|js|jsx|json|md|css|html))`/g)
    if (fileMatches) {
      for (const fm of fileMatches) {
        fileEdits.add(fm.replace(/`/g, ""))
      }
    }
  }

  if (codeBlockCount > 0) {
    parts.push(`\n**涉及代码**：${codeBlockCount} 个代码片段`)
  }
  if (fileEdits.size > 0) {
    parts.push(`\n**涉及文件**：${[...fileEdits].slice(0, 10).join(", ")}`)
  }

  parts.push(`\n\n**消息总数**：${messages.length} 条`)

  return parts.join("")
}

// Exported for testing
export { buildSummarizationPrompt, generateFallbackSummary }
