import { claudeCodeAdapter } from "./claude-code"
import { codexAdapter } from "./codex"
import { opencodeAdapter } from "./opencode"
import { antigravityAdapter } from "./antigravity"
import type { AgentAdapter } from "./types"

export * from "./types"
export * from "./claude-code"
export * from "./codex"
export * from "./opencode"
export * from "./antigravity"

export class AgentRegistry {
  private readonly adapters = new Map<string, AgentAdapter>()

  constructor() {
    this.register(claudeCodeAdapter)
    this.register(codexAdapter)
    this.register(opencodeAdapter)
    this.register(antigravityAdapter)
  }

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter)
  }

  get(id: string): AgentAdapter | undefined {
    return this.adapters.get(id)
  }
}

export const agentRegistry = new AgentRegistry()
