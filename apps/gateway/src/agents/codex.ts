import { spawnWithCleanup } from "./process-cleanup"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { CODEX_BIN, CODEX_ARGS } from "../config"

function logAgentChunk(agent: string, chunk: { type: string; content?: string }) {
  const content = chunk.content ?? ""
  console.log(`[${agent} ${chunk.type}] ${content}`)
}

function streamProcessCodex(
  command: string,
  args: string[],
  cwd: string,
  prompt: string,
  onChunk: (chunk: any) => void,
  onThreadStarted: (threadId: string) => void,
  signal?: AbortSignal,
  permissionMode?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return resolve()
    }
    const cleanEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue
      if (
        key.startsWith("npm_") ||
        key.startsWith("PNPM_") ||
        key === "INIT_CWD" ||
        key === "PROJECT_CWD"
      ) {
        continue
      }
      cleanEnv[key] = value
    }

    const env = {
      ...cleanEnv,
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

    const outputHistory: string[] = []
    const logToHistory = (line: string) => {
      outputHistory.push(line)
      if (outputHistory.length > 50) {
        outputHistory.shift()
      }
    }

    const logAgentText = (text: string) => {
      textBuffer += text
      const lines = textBuffer.split("\n")
      textBuffer = lines.pop() || ""
      for (const line of lines) {
        logAgentChunk("Codex", { type: "text", content: line })
        logToHistory(line)
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
          if (event.type === "thread.started" && event.thread_id) {
            onThreadStarted(event.thread_id)
          } else if (event.type === "text" && event.content) {
            logAgentText(event.content)
            onChunk({ type: "text", content: event.content })
          } else if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
            logAgentText(event.item.text)
            onChunk({ type: "text", content: event.item.text })
          } else if (event.type === "item.started" && event.item?.type === "command_execution" && event.item.command) {
            const command = event.item.command
            
            const extractPath = (cmd: string): string => {
              const cleaned = cmd.replace(/['">|]/g, ' ')
              const tokens = cleaned.split(/\s+/)
              for (const token of tokens) {
                if (token.startsWith("-") || !token.includes(".")) continue
                if (/^(sed|cat|head|tail|grep|find|ripgrep|glob|git|patch|echo|node|npm|pnpm|yarn|bun|python|sh|bash|zsh)$/.test(token)) continue
                if (token.includes("/bin/")) continue
                return token
              }
              return ""
            }

            const targetPath = extractPath(command)
            let statusText = `正在执行命令: ${command}...`

            if (command.includes("sed -n") || command.includes("cat ") || command.includes("head ") || command.includes("tail ") || command.includes("view_file")) {
              statusText = targetPath ? `正在阅读文件: ${targetPath}...` : "正在阅读文件..."
            } else if (command.includes("write_to_file") || command.includes("replace_file_content") || command.includes("git apply") || command.includes("patch") || command.includes(" > ") || command.includes(" >> ")) {
              statusText = targetPath ? `正在修改文件: ${targetPath}...` : "正在修改代码..."
            } else if (command.includes("grep ") || command.includes("find ") || command.includes("ripgrep") || command.includes("glob ")) {
              statusText = targetPath ? `正在搜索目录: ${targetPath}...` : "正在搜索文件..."
            } else {
              const shortCmd = command.length > 60 ? command.substring(0, 60) + "..." : command
              statusText = `正在执行命令: ${shortCmd}`
            }

            logAgentChunk("Codex", { type: "status", content: statusText })
            onChunk({ type: "status", content: statusText })
          } else if (event.type === "thread.run.step.delta" || event.type === "thread.run.step.created") {
            const step = event.step || event.run_step || event.step_delta || event.item
            const toolCalls = step?.step_details?.tool_calls || step?.tool_calls
            if (Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                if (tc.type === "tool_call" || tc.type === "function") {
                  const name = tc.function?.name || tc.name || ""
                  const argsStr = tc.function?.arguments || tc.arguments || ""
                  let args: any = {}
                  try {
                    args = typeof argsStr === "string" ? JSON.parse(argsStr) : argsStr
                  } catch {}
                  const toolName = name
                  const toolInput = args || {}
                  const rawPath = toolInput.path || toolInput.filePath || toolInput.file || toolInput.target || ""
                  const targetPath = typeof rawPath === "string" ? rawPath.trim() : ""
                  const rawCmd = toolInput.command || toolInput.cmd || ""
                  const targetCmd = typeof rawCmd === "string" ? rawCmd.trim() : ""

                  let statusText = `正在使用工具: ${toolName}...`
                  if (toolName === "edit") {
                    statusText = targetPath ? `正在修改文件: ${targetPath}...` : "正在修改代码..."
                  } else if (toolName === "read") {
                    statusText = targetPath ? `正在阅读文件: ${targetPath}...` : "正在阅读文件..."
                  } else if (toolName === "bash") {
                    statusText = targetCmd ? `正在执行命令: ${targetCmd}...` : "正在执行终端命令..."
                  } else if (toolName === "glob") {
                    statusText = targetPath ? `正在搜索目录: ${targetPath}...` : "正在搜索文件..."
                  }
                  
                  logAgentChunk("Codex", { type: "status", content: statusText })
                  onChunk({ type: "status", content: statusText })
                  logToHistory(`[状态] ${statusText}`)
                }
              }
            }
          } else if (event.type === "error" && event.message) {
            logAgentChunk("Codex", { type: "error", content: event.message })
            onChunk({ type: "error", content: event.message })
            logToHistory(`[错误] ${event.message}`)
          } else if (event.type === "turn.failed" && event.error?.message) {
            logAgentChunk("Codex", { type: "error", content: event.error.message })
            onChunk({ type: "error", content: event.error.message })
          }
        } catch {
          logAgentText(trimmed + "\n")
          onChunk({ type: "text", content: trimmed + "\n" })
        }
      }
    })

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim()
      console.error(`[Codex Stderr] ${text}`)
      logToHistory(`[Stderr] ${text}`)
    })

    child.on("close", (code) => {
      if (textBuffer) {
        logAgentChunk("Codex", { type: "text", content: textBuffer })
      }
      if (signal?.aborted) {
        resolve()
      } else if (code === 0) {
        resolve()
      } else {
        let errMsg = `Codex process exited with code ${code}.`
        if (outputHistory.length > 0) {
          errMsg += ` Last outputs:\n${outputHistory.slice(-8).join("\n")}`
        }
        if (permissionMode !== "full") {
          errMsg += `\n提示：当前处于‘受限访问’模式，Agent 渠道（Codex）在执行敏感操作（如文件修改或命令执行）时由于无法在后台进行交互式权限确认，可能会直接退出。如果遇到此问题，请在侧边栏或悬浮窗开启‘完全访问’。`
        }
        reject(new Error(errMsg))
      }
    })

    child.on("error", reject)
  })
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
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

    console.log("=== [Codex Agent Prompt] ===")
    console.log(prompt)
    console.log("============================")

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
      options.push("-c", `model_reasoning_effort=${request.effort}`)
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
      },
      signal,
      request.permissionMode
    )
  }
}
