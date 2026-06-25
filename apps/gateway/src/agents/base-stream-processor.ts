import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { spawnWithCleanup } from "./process-cleanup"

export interface BaseStreamProcessorOptions {
  /** 日志前缀，用于 console.log / 错误消息 */
  agentLabel: string
  /** 输出回调 */
  onChunk: (chunk: any) => void
  /** 取消信号 */
  signal?: AbortSignal
  /** 权限模式，用于非零退出时的错误提示 */
  permissionMode?: string
  /** 是否在 close 时排空 stdoutBuffer 中的残留行（OpenCode 需要） */
  drainStdoutBufferOnClose?: boolean
  /** 是否在错误消息中包含 stderr（Codex 不需要） */
  includeStderrInError?: boolean
}

/**
 * 所有 Agent 进程流式处理的抽象基类。
 * Template Method：execute() → spawn → pipe stdin → loop handleLine() → close。
 */
export abstract class BaseStreamProcessor {
  private stdoutBuffer = ""
  private textBuffer = ""
  private stderrBuffer = ""
  private readonly outputHistory: string[] = []

  constructor(protected readonly opts: BaseStreamProcessorOptions) {}

  /** 由子类实现：处理每一行完整的 stdout 输出 */
  protected abstract handleLine(line: string): void

  /** 可选钩子：spawn 后、写 stdin 前调用（OpenCode 用于设置心跳） */
  protected onSetup?(_child: ChildProcessWithoutNullStreams): void
  /** 可选钩子：进程 close/error 后调用（OpenCode 用于拆除心跳） */
  protected onTeardown?(): void

  /** 日志输出 */
  protected logAgentChunk(chunk: { type: string; content?: string }): void {
    const content = chunk.content ?? ""
    console.log(`[${this.opts.agentLabel} ${chunk.type}] ${content}`)
  }

  /** 直接传递 chunk 到上层回调 */
  protected emitChunk(chunk: any): void {
    this.opts.onChunk(chunk)
  }

  /** 按行分割文本并逐行记录日志 */
  protected logAgentText(text: string): void {
    this.textBuffer += text
    const lines = this.textBuffer.split("\n")
    this.textBuffer = lines.pop() || ""
    for (const line of lines) {
      this.logAgentChunk({ type: "text", content: line })
    }
  }

  /** 向环形历史缓冲区追加一行 */
  protected addToHistory(line: string): void {
    this.outputHistory.push(line)
    if (this.outputHistory.length > 50) {
      this.outputHistory.shift()
    }
  }

  /** 构建非零退出错误消息 */
  protected buildError(code: number): Error {
    let errMsg = `${this.opts.agentLabel} process exited with code ${code}.`
    if (this.opts.includeStderrInError !== false && this.stderrBuffer.trim()) {
      errMsg += ` Stderr: ${this.stderrBuffer}`
    } else if (this.outputHistory.length > 0) {
      errMsg += ` Last outputs:\n${this.outputHistory.slice(-8).join("\n")}`
    }
    if (this.opts.permissionMode !== "full") {
      errMsg += `\n提示：当前处于'受限访问'模式，Agent 渠道（${this.opts.agentLabel}）在执行敏感操作（如文件修改或命令执行）时由于无法在后台进行交互式权限确认，可能会直接退出。如果遇到此问题，请在侧边栏或悬浮窗开启'完全访问'。`
    }
    return new Error(errMsg)
  }

  /** 构建清理后的环境变量（过滤 npm_ / PNPM_ 前缀，添加超时变量） */
  protected buildCleanEnv(): Record<string, string> {
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
    return {
      ...cleanEnv,
      HTTP_TIMEOUT: "600000",
      API_TIMEOUT: "600000",
      TIMEOUT: "600000",
      GEMINI_API_TIMEOUT: "600000",
      CLAUDE_API_TIMEOUT: "600000",
    }
  }

  /**
   * Template Method：启动子进程，写 stdin，逐行解析 stdout，
   * 收集 stderr，在 close/error 时 resolve/reject。
   */
  async execute(command: string, args: string[], cwd: string, prompt: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.opts.signal?.aborted) {
        return resolve()
      }

      const env = this.buildCleanEnv()
      const child = spawnWithCleanup(command, args, { cwd, env }, this.opts.signal)

      this.onSetup?.(child)

      child.stdin.write(prompt)
      child.stdin.end()

      const processLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) return
        this.handleLine(trimmed)
      }

      child.stdout.on("data", (chunk: Buffer) => {
        this.stdoutBuffer += chunk.toString()
        const lines = this.stdoutBuffer.split("\n")
        this.stdoutBuffer = lines.pop() || ""
        for (const line of lines) {
          processLine(line)
        }
      })

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString()
        this.stderrBuffer += text
        console.error(`[${this.opts.agentLabel} Stderr] ${text.trim()}`)
        this.addToHistory(`[Stderr] ${text.trim()}`)
      })

      child.on("close", (code) => {
        this.onTeardown?.()

        // 排空残留行（OpenCode 需要）
        if (this.opts.drainStdoutBufferOnClose && this.stdoutBuffer.trim()) {
          processLine(this.stdoutBuffer)
          this.stdoutBuffer = ""
        }

        if (this.textBuffer) {
          this.logAgentChunk({ type: "text", content: this.textBuffer })
        }

        if (this.opts.signal?.aborted) {
          resolve()
        } else if (code === 0) {
          resolve()
        } else {
          reject(this.buildError(code!))
        }
      })

      child.on("error", (err) => {
        this.onTeardown?.()
        reject(err)
      })
    })
  }
}
