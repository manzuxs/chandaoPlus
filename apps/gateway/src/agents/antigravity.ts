import { StreamEventProcessor } from "./stream-event-processor"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { ANTIGRAVITY_BIN, ANTIGRAVITY_ARGS } from "../config"

export const antigravityAdapter: AgentAdapter = {
  id: "antigravity",
  async run({ workspace, bundleDir, request, skill, onChunk, sessionStore: _sessionStore, signal }: AgentRunOptions) {
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

    console.log("=== [Antigravity Agent Prompt] ===")
    console.log(prompt)
    console.log("==================================")

    const bin = process.env.ANTIGRAVITY_BIN || ANTIGRAVITY_BIN
    const rawArgs = process.env.ANTIGRAVITY_ARGS || ANTIGRAVITY_ARGS
    const args = rawArgs.split(/\s+/).filter(Boolean)

    // agy 仅支持 --print 模式的基本标志，无 --output-format/--include-partial-messages/--verbose/--effort/--permission-mode
    if (!args.includes("--print") && !args.includes("-p")) {
      args.push("--print")
    }

    // TODO: agy 使用 --conversation <id> 恢复会话（非 --session-id/--resume），
    // 需要从 agy stdout 捕获会话 ID 后存入 sessionStore 才能支持续问。
    // 当前不支持会话恢复。

    if (request.model && request.model !== "default") {
      args.push("--model", request.model)
    }

    if (request.permissionMode === "full") {
      args.push("--dangerously-skip-permissions")
    }

    const processor = new StreamEventProcessor({
      agentLabel: "Antigravity",
      onChunk,
      signal,
      permissionMode: request.permissionMode,
    })

    try {
      await processor.execute(bin, args, workspace.rootPath, prompt)
    } catch (err: any) {
      if (err.code === "ENOENT" || err.message.includes("ENOENT")) {
        throw new Error(`未检测到本地 agy 命令行工具，请检查 PATH 或 ANTIGRAVITY_BIN 环境变量。`)
      }
      throw err
    }
  },
}
