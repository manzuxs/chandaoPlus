import os from "node:os"
import path from "node:path"

const FORBIDDEN_PREFIXES = [
  "/",
  "/root",
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/var",
  "/tmp",
  "/System",
  "/Library",
  "/Applications",
]

/**
 * Validate that a workspace rootPath is a safe directory for agent execution.
 * Rejects home directory, root-level paths, and system directories.
 */
export function validateWorkspaceRoot(rootPath: string): { valid: true } | { valid: false; reason: string } {
  if (!path.isAbsolute(rootPath)) {
    return { valid: false, reason: "工作区路径必须是绝对路径" }
  }

  const normalized = path.normalize(rootPath)
  const homedir = os.homedir()

  // Reject home directory exactly
  if (normalized === homedir) {
    return { valid: false, reason: "工作区不能设置为用户主目录。请创建一个项目子目录作为工作区" }
  }

  // Reject root filesystem
  if (normalized === "/") {
    return { valid: false, reason: "工作区不能设置为系统根目录" }
  }

  // Reject system directories
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (normalized === prefix || normalized === prefix + "/") {
      return { valid: false, reason: `工作区不能设置为系统目录: ${prefix}` }
    }
  }

  // Reject if path is too shallow (just home + one level, e.g. /Users/xxx/Desktop)
  // Require at least 2 levels below home for safety
  if (normalized.startsWith(homedir + "/")) {
    const relative = normalized.slice(homedir.length + 1)
    const depth = relative.split(path.sep).filter(Boolean).length
    if (depth < 2) {
      return { valid: false, reason: "工作区路径层级过浅，请使用更具体的项目子目录（至少两级）" }
    }
  }

  return { valid: true }
}
