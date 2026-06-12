import { spawn } from "node:child_process"
import { buildPrompt } from "./types"
import type { AgentAdapter, AgentRunOptions } from "./types"
import { CODEX_BIN, CODEX_ARGS } from "../config"

function streamProcess(
  command: string,
  args: string[],
  cwd: string,
  prompt: string,
  onText: (text: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
    
    child.stdin.write(prompt)
    child.stdin.end()

    child.stdout.on("data", (chunk) => onText(chunk.toString()))
    child.stderr.on("data", (chunk) => onText(chunk.toString()))

    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Process exited with code ${code}`))
      }
    })

    child.on("error", reject)
  })
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
  async run({ workspace, bundleDir, request, skill, onChunk }: AgentRunOptions) {
    const lastMessage = request.messages.at(-1)?.content ?? ""
    const prompt = buildPrompt(
      request.command,
      workspace.rootPath,
      bundleDir,
      lastMessage,
      request.page.title,
      request.page.url,
      skill
    )
    const bin = process.env.CODEX_BIN || CODEX_BIN
    const rawArgs = process.env.CODEX_ARGS || CODEX_ARGS
    const args = rawArgs.split(/\s+/).filter(Boolean)

    await streamProcess(bin, args, workspace.rootPath, prompt, (text) => {
      onChunk({ type: "text", content: text })
    })
  }
}
