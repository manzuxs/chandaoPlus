import { StreamEventProcessor } from "./stream-event-processor"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { QCODE_BIN, QCODE_ARGS } from "../config"
import { cleanupSessionLock } from "./session-cleanup"

/**
 * Qcode 专用事件处理器，在 StreamEventProcessor 基础上
 * 额外处理 assistant 消息的 delta 事件。
 */
class QcodeEventProcessor extends StreamEventProcessor {
  protected processEvent(event: any): void {
    if (event.type === "assistant" && event.message) {
      const msg = event.message
      if (msg.delta) {
        if (msg.delta.text) {
          this.logAgentText(msg.delta.text)
          this.emitChunkWithThrottle({ type: "text", content: msg.delta.text })
        }
        if (msg.delta.thinking) {
          this.emitChunkWithThrottle({ type: "thinking", content: msg.delta.thinking })
          this.maybeEmitThinkingStatus()
        }
      }
    }
    super.processEvent(event)
  }
}

export const qcodeAdapter: AgentAdapter = {
  id: "qcode",
  async run({ workspace, bundleDir, request, skill, onChunk, sessionStore, signal }: AgentRunOptions) {
    if (request.sessionId) {
      await cleanupSessionLock(request.sessionId, "Qcode")
    }

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

    console.log("=== [Qcode Agent Prompt] ===")
    console.log(prompt)
    console.log("==================================")

    const bin = process.env.QCODE_BIN || QCODE_BIN
    const rawArgs = process.env.QCODE_ARGS || QCODE_ARGS
    const args = rawArgs.split(/\s+/).filter(Boolean)

    if (!args.includes("--print") && !args.includes("-p")) {
      args.push("--print")
    }
    if (!args.includes("--output-format")) {
      args.push("--output-format", "stream-json")
    }
    if (!args.includes("--include-partial-messages")) {
      args.push("--include-partial-messages")
    }

    if (request.sessionId && sessionStore) {
      const existing = await sessionStore.get(request.sessionId)
      const isFirstQuery = !existing || !existing.messages || existing.messages.length <= 1
      if (isFirstQuery) {
        args.push("--session-id", request.sessionId)
      } else {
        args.push("--resume", request.sessionId)
      }
    }

    if (request.effort) {
      args.push("--reasoning-effort", request.effort)
    }

    if (request.model && request.model !== "default") {
      args.push("--model", request.model)
    }

    if (request.permissionMode === "full") {
      args.push("--dangerously-skip-permissions")
    } else {
      args.push("--permission-mode", "default")
    }

    const processor = new QcodeEventProcessor({
      agentLabel: "Qcode",
      onChunk,
      signal,
      permissionMode: request.permissionMode,
    })

    try {
      await processor.execute(bin, args, workspace.rootPath, prompt)
    } catch (err: any) {
      const isResume = args.includes("--resume")
      const shouldFallback = isResume && (
        err.message.includes("No conversation found") ||
        err.message.includes("Invalid session identifier") ||
        err.message.includes("exited with code")
      )

      if (shouldFallback) {
        console.warn(`[Qcode] Session resume failed. Falling back to init mode. Error: ${err.message}`)
        const fallbackArgs: string[] = []
        for (let i = 0; i < args.length; i++) {
          if (args[i] === "--resume") {
            fallbackArgs.push("--session-id")
          } else {
            fallbackArgs.push(args[i])
          }
        }
        await processor.execute(bin, fallbackArgs, workspace.rootPath, prompt)
      } else {
        throw err
      }
    }
  },
}
