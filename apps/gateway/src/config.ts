import dotenv from "dotenv"
import path from "node:path"
import os from "node:os"

dotenv.config()

export const PORT = Number(process.env.PORT || 3210)
export const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude"
export const CLAUDE_ARGS = process.env.CLAUDE_ARGS || "--print"
export const CODEX_BIN = process.env.CODEX_BIN || "codex"
export const CODEX_ARGS = process.env.CODEX_ARGS || "exec --skip-git-repo-check"
export const OPENCODE_BIN = process.env.OPENCODE_BIN || "opencode"
export const OPENCODE_ARGS = process.env.OPENCODE_ARGS || "run"

// Default location for workspace profile storage file
export const WORKSPACE_STORE_PATH =
  process.env.WORKSPACE_STORE_PATH ||
  path.join(os.homedir(), ".chandaoplus", "workspaces.json")

// Default location for skills storage file
export const SKILL_STORE_PATH =
  process.env.SKILL_STORE_PATH ||
  path.join(os.homedir(), ".chandaoplus", "skills.json")
