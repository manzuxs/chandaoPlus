import { BaseStreamProcessor, type BaseStreamProcessorOptions } from "./base-stream-processor"

/**
 * Claude Code SDK 协议族的共享流处理器。
 * 处理 stream_event / progress / error 事件，提供思考中节流。
 * claude-code、antigravity、qcode 共用。
 */
export class StreamEventProcessor extends BaseStreamProcessor {
  protected lastThinkingLogTime = 0
  protected lastActionStatusTime = 0

  constructor(opts: BaseStreamProcessorOptions) {
    super(opts)
  }

  /** 每行 stdout：尝试 JSON 解析，失败则作为纯文本输出 */
  protected handleLine(line: string): void {
    try {
      const event = JSON.parse(line)
      this.processEvent(event)
    } catch {
      this.logAgentText(line + "\n")
      this.emitChunk({ type: "text", content: line + "\n" })
    }
  }

  /**
   * 处理顶层 JSON 事件。
   * Qcode 覆盖此方法以额外处理 assistant 事件。
   */
  protected processEvent(event: any): void {
    if (event.type === "stream_event") {
      const inner = event.event
      if (inner) {
        this.handleStreamEvent(inner)
      }
    } else if (event.type === "progress" && event.content) {
      this.logAgentChunk({ type: "status", content: event.content })
      this.emitChunkWithThrottle({ type: "status", content: event.content })
    } else if (event.type === "error" && event.message) {
      this.logAgentChunk({ type: "error", content: event.message })
      this.emitChunkWithThrottle({ type: "error", content: event.message })
    }
  }

  /** 解析 stream_event 内部事件 */
  protected handleStreamEvent(inner: any): void {
    if (inner.type === "content_block_start" && inner.content_block) {
      const block = inner.content_block
      if (block.type === "tool_use" && block.name) {
        const statusText = this.formatToolStatus(block.name, block.input || {})
        this.logAgentChunk({ type: "status", content: statusText })
        this.emitChunkWithThrottle({ type: "status", content: statusText })
      }
    }

    if (inner.type === "content_block_delta" && inner.delta) {
      if (inner.delta.type === "text_delta" && inner.delta.text) {
        this.logAgentText(inner.delta.text)
        this.emitChunkWithThrottle({ type: "text", content: inner.delta.text })
      } else if (inner.delta.type === "thinking_delta" && inner.delta.thinking) {
        this.emitChunkWithThrottle({ type: "thinking", content: inner.delta.thinking })
        this.maybeEmitThinkingStatus()
      }
    }
  }

  /** 工具使用 → 中文状态文本 */
  protected formatToolStatus(toolName: string, input: Record<string, unknown>): string {
    const rawPath = input.path || input.filePath || input.file || input.target || ""
    const targetPath = typeof rawPath === "string" ? rawPath.trim() : ""
    const rawCmd = input.command || input.cmd || ""
    const targetCmd = typeof rawCmd === "string" ? rawCmd.trim() : ""

    if (toolName.includes("write") || toolName.includes("edit") || toolName.includes("replace") || toolName.includes("patch")) {
      return targetPath ? `正在修改文件: ${targetPath}...` : "正在修改代码..."
    }
    if (toolName.includes("read") || toolName.includes("view") || toolName.includes("show")) {
      return targetPath ? `正在阅读文件: ${targetPath}...` : "正在阅读文件..."
    }
    if (toolName.includes("bash") || toolName.includes("execute") || toolName.includes("run") || toolName.includes("cmd")) {
      return targetCmd ? `正在执行命令: ${targetCmd}...` : "正在执行终端命令..."
    }
    if (toolName.includes("glob") || toolName.includes("find") || toolName.includes("search")) {
      return targetPath ? `正在搜索目录: ${targetPath}...` : "正在搜索文件..."
    }
    return `正在使用工具: ${toolName}...`
  }

  /** 带节流的 chunk 发射：动作状态直接放行，"思考中..." 需间隔 1.5s 以上 */
  protected emitChunkWithThrottle(chunk: any): void {
    if (chunk.type === "status") {
      if (this.isActionContent(chunk.content)) {
        this.lastActionStatusTime = Date.now()
        this.emitChunk(chunk)
        this.addToHistory(`[状态] ${chunk.content}`)
      } else if (chunk.content === "思考中...") {
        const elapsed = Date.now() - this.lastActionStatusTime
        if (elapsed < 1500) return
        this.emitChunk(chunk)
      } else {
        this.emitChunk(chunk)
        this.addToHistory(`[状态] ${chunk.content}`)
      }
    } else if (chunk.type === "text") {
      this.emitChunk(chunk)
      this.addToHistory(chunk.content)
    } else {
      this.emitChunk(chunk)
    }
  }

  protected isActionContent(content: string): boolean {
    return (
      content.includes("正在修改") ||
      content.includes("正在阅读") ||
      content.includes("正在执行") ||
      content.includes("正在搜索") ||
      content.includes("正在使用工具")
    )
  }

  /** 2 秒节流发射 "思考中..." 状态 */
  protected maybeEmitThinkingStatus(): void {
    const now = Date.now()
    if (now - this.lastThinkingLogTime > 2000) {
      this.lastThinkingLogTime = now
      this.logAgentChunk({ type: "status", content: "思考中..." })
      this.emitChunkWithThrottle({ type: "status", content: "思考中..." })
    }
  }
}
