import { StreamEventProcessor } from "./stream-event-processor"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { CLAUDE_BIN, CLAUDE_ARGS } from "../config"

export const claudeCodeAdapter: AgentAdapter = {
  id: "claude-code",
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

    console.log("=== [Claude Code Agent Prompt] ===")
    console.log(prompt)
    console.log("==================================")

    const bin = process.env.CLAUDE_BIN || CLAUDE_BIN
    const rawArgs = process.env.CLAUDE_ARGS || CLAUDE_ARGS
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
    if (!args.includes("--verbose")) {
      args.push("--verbose")
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
      args.push("--effort", request.effort)
    }

    if (request.model && request.model !== "default") {
      args.push("--model", request.model)
    }

    if (request.permissionMode === "full") {
      args.push("--permission-mode", "bypassPermissions")
    } else {
      args.push("--permission-mode", "plan")
    }

    const processor = new StreamEventProcessor({
      agentLabel: "Claude Code",
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
        err.message.includes("exited with code")
      )

      if (shouldFallback) {
        console.warn(`[Claude Code] Session resume failed. Falling back to init mode. Error: ${err.message}`)
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
