import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { BaseStreamProcessor, type BaseStreamProcessorOptions } from "./base-stream-processor"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { OPENCODE_BIN, OPENCODE_ARGS } from "../config"

class OpenCodeEventProcessor extends BaseStreamProcessor {
  private startedAt = 0
  private lastActivityAt = 0
  private stdoutBytes = 0
  private stderrBytes = 0
  private textChunks = 0
  private readonly eventCounts: Record<string, number> = {}
  private heartbeat?: NodeJS.Timeout
  private child?: ChildProcessWithoutNullStreams
  private execCwd = ""
  private execCommand = ""
  private execArgs: string[] = []

  constructor(opts: BaseStreamProcessorOptions) {
    super(opts)
  }

  protected onSetup(child: ChildProcessWithoutNullStreams): void {
    this.child = child
    this.startedAt = Date.now()
    this.lastActivityAt = this.startedAt
    console.log(`[OpenCode start] pid=${child.pid ?? "unknown"} cwd=${this.execCwd} command=${this.execCommand} args=${JSON.stringify(this.execArgs)}`)
    this.heartbeat = setInterval(() => {
      const idleMs = Date.now() - this.lastActivityAt
      const elapsedMs = Date.now() - this.startedAt
      console.log(`[OpenCode heartbeat] pid=${this.child?.pid ?? "unknown"} elapsedMs=${elapsedMs} idleMs=${idleMs} stdoutBytes=${this.stdoutBytes} stderrBytes=${this.stderrBytes} textChunks=${this.textChunks} events=${JSON.stringify(this.eventCounts)}`)
    }, 15000)
  }

  protected onTeardown(code: number | null): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = undefined
    }
    console.log(`[OpenCode close] code=${code} signalAborted=${this.opts.signal?.aborted ? "yes" : "no"} elapsedMs=${Date.now() - this.startedAt} stdoutBytes=${this.stdoutBytes} stderrBytes=${this.stderrBytes} textChunks=${this.textChunks} events=${JSON.stringify(this.eventCounts)}`)
  }

  setExecInfo(cwd: string, command: string, args: string[]): void {
    this.execCwd = cwd
    this.execCommand = command
    this.execArgs = args
  }

  private formatOpenCodeToolStatus(toolName: string, input: Record<string, unknown>): string {
    const rawPath = input.path || input.filePath || input.file || ""
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
    // handleLine receives trimmed lines already
    this.lastActivityAt = Date.now()
    try {
      const event = JSON.parse(line)
      this.eventCounts[event.type] = (this.eventCounts[event.type] || 0) + 1

      if (event.sessionID && typeof event.sessionID === "string") {
        this.emitChunk({ type: "opencode_session_id", content: event.sessionID })
      }

      if (event.type === "text" && event.part && event.part.text) {
        this.textChunks += 1
        this.logAgentText(event.part.text)
        this.emitChunk({ type: "text", content: event.part.text })
      } else if (event.type === "step_start") {
        console.log(`[OpenCode event] ${event.type} 会话：${event.sessionID || "无"}，事件：步骤启动...`)
        const startCount = this.eventCounts["step_start"] || 0
        if (startCount === 1) {
          this.logAgentChunk({ type: "status", content: "开始运行..." })
          this.emitChunk({ type: "status", content: "开始运行..." })
          this.addToHistory("[状态] 开始运行...")
        }
      } else if (event.part?.type === "tool" && event.part?.tool) {
        const statusText = this.formatOpenCodeToolStatus(event.part.tool, event.part.input || event.part.arguments || {})
        console.log(`[OpenCode event] ${event.type} 会话：${event.sessionID || "无"}，事件：${statusText}`)
        this.logAgentChunk({ type: "status", content: statusText })
        this.emitChunk({ type: "status", content: statusText })
        this.addToHistory(`[状态] ${statusText}`)
      } else if (event.type === "error") {
        const msg = event.error?.message || event.error?.data?.message || "Unknown error"
        this.logAgentChunk({ type: "error", content: msg })
        this.emitChunk({ type: "error", content: msg })
        this.addToHistory(`[错误] ${msg}`)
      } else {
        const reasonText = event.part?.reason ? ` (${event.part.reason})` : ""
        console.log(`[OpenCode event] ${event.type} 会话：${event.sessionID || "无"}，事件：${event.type}${reasonText}`)
      }
    } catch {
      this.lastActivityAt = Date.now()
      this.logAgentText(line + "\n")
      this.emitChunk({ type: "text", content: line + "\n" })
    }
  }
}

export const opencodeAdapter: AgentAdapter = {
  id: "opencode",
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

    console.log("=== [OpenCode Agent Prompt] ===")
    console.log(prompt)
    console.log("================================")

    const bin = process.env.OPENCODE_BIN || OPENCODE_BIN
    const rawArgs = process.env.OPENCODE_ARGS || OPENCODE_ARGS
    const args = rawArgs.split(/\s+/).filter(Boolean)

    if (!args.includes("--format")) {
      args.push("--format", "json")
    }
    if (!args.includes("--pure")) {
      args.push("--pure")
    }

    const skipIndex = args.indexOf("--dangerously-skip-permissions")
    if (request.permissionMode === "full") {
      if (skipIndex === -1) {
        args.push("--dangerously-skip-permissions")
      }
    } else {
      if (skipIndex !== -1) {
        args.splice(skipIndex, 1)
      }
    }

    let opencodeSessionId: string | undefined
    if (request.sessionId && sessionStore) {
      try {
        const session = await sessionStore.get(request.sessionId)
        opencodeSessionId = session?.opencodeSessionId
      } catch (err: any) {
        console.warn(`[OpenCode] Failed to read sessionStore for session ${request.sessionId}:`, err.message)
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

    const processor = new OpenCodeEventProcessor({
      agentLabel: "OpenCode",
      onChunk,
      signal,
      permissionMode: request.permissionMode,
      drainStdoutBufferOnClose: true,
    })

    processor.setExecInfo(workspace.rootPath, bin, args)
    await processor.execute(bin, args, workspace.rootPath, prompt)
  },
}
