import { BaseStreamProcessor, type BaseStreamProcessorOptions } from "./base-stream-processor"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { CODEX_BIN } from "../config"

class CodexEventProcessor extends BaseStreamProcessor {
  constructor(
    opts: BaseStreamProcessorOptions,
    private readonly onThreadStarted: (threadId: string) => void,
  ) {
    super(opts)
  }

  /** Codex 专有：从 shell 命令字符串中提取目标文件路径 */
  private extractPathFromShellCommand(cmd: string): string {
    const cleaned = cmd.replace(/['">|]/g, " ")
    const tokens = cleaned.split(/\s+/)
    for (const token of tokens) {
      if (token.startsWith("-") || !token.includes(".")) continue
      if (/^(sed|cat|head|tail|grep|find|ripgrep|glob|git|patch|echo|node|npm|pnpm|yarn|bun|python|sh|bash|zsh)$/.test(token)) continue
      if (token.includes("/bin/")) continue
      return token
    }
    return ""
  }

  /** 工具调用参数提取 → 中文状态文本 */
  private formatCodexToolStatus(toolName: string, input: Record<string, unknown>): string {
    const rawPath = input.path || input.filePath || input.file || input.target || ""
    const targetPath = typeof rawPath === "string" ? rawPath.trim() : ""
    const rawCmd = input.command || input.cmd || ""
    const targetCmd = typeof rawCmd === "string" ? rawCmd.trim() : ""

    if (toolName === "edit") {
      return targetPath ? `正在修改文件: ${targetPath}...` : "正在修改代码..."
    }
    if (toolName === "read") {
      return targetPath ? `正在阅读文件: ${targetPath}...` : "正在阅读文件..."
    }
    if (toolName === "bash") {
      return targetCmd ? `正在执行命令: ${targetCmd}...` : "正在执行终端命令..."
    }
    if (toolName === "glob") {
      return targetPath ? `正在搜索目录: ${targetPath}...` : "正在搜索文件..."
    }
    return `正在使用工具: ${toolName}...`
  }

  protected handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      const event = JSON.parse(trimmed)

      if (event.type === "thread.started" && event.thread_id) {
        this.onThreadStarted(event.thread_id)
      } else if (event.type === "text" && event.content) {
        this.logAgentText(event.content)
        this.emitChunk({ type: "text", content: event.content })
      } else if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
        this.logAgentText(event.item.text)
        this.emitChunk({ type: "text", content: event.item.text })
      } else if (event.type === "item.started" && event.item?.type === "command_execution" && event.item.command) {
        const command = event.item.command
        const targetPath = this.extractPathFromShellCommand(command)
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

        this.logAgentChunk({ type: "status", content: statusText })
        this.emitChunk({ type: "status", content: statusText })
      } else if (event.type === "thread.run.step.delta" || event.type === "thread.run.step.created") {
        const step = event.step || event.run_step || event.step_delta || event.item
        const toolCalls = step?.step_details?.tool_calls || step?.tool_calls
        if (Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            if (tc.type === "tool_call" || tc.type === "function") {
              const name = tc.function?.name || tc.name || ""
              let args: any = {}
              try {
                const argsStr = tc.function?.arguments || tc.arguments || ""
                args = typeof argsStr === "string" ? JSON.parse(argsStr) : argsStr
              } catch {}
              const statusText = this.formatCodexToolStatus(name, args || {})
              this.logAgentChunk({ type: "status", content: statusText })
              this.emitChunk({ type: "status", content: statusText })
              this.addToHistory(`[状态] ${statusText}`)
            }
          }
        }
      } else if (event.type === "error" && event.message) {
        this.logAgentChunk({ type: "error", content: event.message })
        this.emitChunk({ type: "error", content: event.message })
        this.addToHistory(`[错误] ${event.message}`)
      } else if (event.type === "turn.failed" && event.error?.message) {
        this.logAgentChunk({ type: "error", content: event.error.message })
        this.emitChunk({ type: "error", content: event.error.message })
      }
    } catch {
      this.logAgentText(trimmed + "\n")
      this.emitChunk({ type: "text", content: trimmed + "\n" })
    }
  }
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
    if (request.effort) {
      options.push("-c", `model_reasoning_effort=${request.effort}`)
    }
    if (request.permissionMode === "full") {
      options.push("--dangerously-bypass-approvals-and-sandbox")
    }

    let args: string[]
    if (codexThreadId) {
      args = ["exec", "resume", codexThreadId, ...options, "--skip-git-repo-check", "--json", "-"]
    } else {
      args = ["exec", ...options, "--skip-git-repo-check", "--json", "-"]
    }

    const processor = new CodexEventProcessor(
      {
        agentLabel: "Codex",
        onChunk,
        signal,
        permissionMode: request.permissionMode,
        includeStderrInError: false,
      },
      (threadId) => {
        if (request.sessionId && sessionStore) {
          sessionStore.updateCodexThreadId(request.sessionId, threadId).catch((err: any) => {
            console.error("Failed to update codex thread id:", err)
          })
        }
      },
    )

    await processor.execute(bin, args, workspace.rootPath, prompt)
  },
}
