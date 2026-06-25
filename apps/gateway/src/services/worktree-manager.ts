import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { join, relative, dirname } from "node:path"
import { mkdir, access, readdir, stat, readFile, writeFile, symlink, rm } from "node:fs/promises"

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 30_000

/**
 * 执行 git 命令，带超时保护。
 */
async function execGit(args: string[], opts: { cwd: string; timeout?: number }): Promise<{ stdout: string; stderr: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? GIT_TIMEOUT_MS)
  try {
    return await execFileAsync("git", args, { cwd: opts.cwd, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 在给定目录下查找 Git 仓库根路径。
 * 使用 `git rev-parse --show-toplevel` 确定当前目录所属的 Git 仓库。
 */
export async function findGitRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execGit(["rev-parse", "--show-toplevel"], { cwd: dir })
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * 获取指定 Git 仓库当前所在的分支名。
 */
async function getCurrentBranch(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot })
    return stdout.trim()
  } catch {
    return "main"
  }
}

/**
 * 递归查找某个目录下的所有子 Git 仓库（即包含 .git 的目录）。
 * 遇到 .git 即停止该分支的递归，返回找到的所有 Git 仓库绝对路径。
 */
export async function findGitRepos(dir: string, maxDepth = 3, currentDepth = 0): Promise<string[]> {
  // 检查当前目录是否包含 .git
  const dotGitPath = join(dir, ".git")
  try {
    const st = await stat(dotGitPath)
    if (st.isDirectory() || st.isFile()) {
      return [dir]
    }
  } catch {
    // 未发现 .git
  }

  if (currentDepth >= maxDepth) {
    return []
  }

  const repos: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const name = entry.name
        // 排除隐藏文件/依赖/编译输出等目录
        if (name.startsWith(".") || name === "node_modules" || name === "dist" || name === "build" || name === "out" || name === "temp") {
          continue
        }
        const subPath = join(dir, name)
        const subRepos = await findGitRepos(subPath, maxDepth, currentDepth + 1)
        repos.push(...subRepos)
      }
    }
  } catch {
    // 忽略读取错误
  }

  return repos
}

/**
 * 根据任务标识生成 worktree 目录名。
 */
export function getWorktreeDirName(taskLabel?: string, sessionId?: string): string {
  if (taskLabel) {
    return `worktree-${taskLabel}`
  }
  const shortId = (sessionId || "unknown").replace(/-/g, "").slice(0, 8)
  return `worktree-session-${shortId}`
}

/**
 * 从页面元数据中提取任务标识（用于 worktree 命名/清理）。
 * 对 bugId/taskId 做严格消毒，仅保留数字字符，防止路径遍历攻击。
 */
export function extractTaskLabel(metadata: Record<string, string> | undefined): string | undefined {
  if (!metadata) return undefined
  if (metadata.pageKind === "zentao-bug-detail" && metadata.bugId) {
    const numericId = metadata.bugId.replace(/[^0-9]/g, "")
    if (!numericId) return undefined
    return `bug-${numericId}`
  }
  if (metadata.pageKind === "zentao-task-detail" && metadata.taskId) {
    const numericId = metadata.taskId.replace(/[^0-9]/g, "")
    if (!numericId) return undefined
    return `task-${numericId}`
  }
  return undefined
}

function getWorktreeBranch(dirName: string): string {
  const suffix = dirName.replace(/^worktree-/, "")
  return `chandaoplus/${suffix}`
}

export interface WorktreeInfo {
  /** worktree 目录路径 */
  path: string
  /** 关联的分支名（主要针对单仓库，多仓库时返回统一分支名） */
  branch: string
  /** 原始仓库根路径 */
  repoRoot: string
  /** worktree 目录名 */
  dirName: string
  /** 创建 worktree 时的基础分支（合并目标） */
  baseBranch: string
}

/**
 * 检查 git 分支是否存在。
 */
async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  try {
    const { stdout } = await execGit(["branch", "--list", branch], { cwd: repoRoot })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

/**
 * 确保 .gitignore 中包含 worktree-* 规则。
 */
async function ensureGitIgnore(repoRoot: string): Promise<void> {
  const gitignorePath = join(repoRoot, ".gitignore")
  const pattern = "worktree-*"

  try {
    const content = await readFile(gitignorePath, "utf8")
    const lines = content.split("\n").map(l => l.trim())
    if (lines.includes(pattern)) {
      return
    }
    // 通过 Set 去重后再写入，避免并发导致的重复行
    const deduped = [...new Set([...lines.filter(l => l.length > 0), pattern])]
    await writeFile(gitignorePath, deduped.join("\n") + "\n")
    console.log(`[WorktreeManager] Added '${pattern}' to ${gitignorePath}`)
  } catch {
    await writeFile(gitignorePath, `${pattern}\n`)
    console.log(`[WorktreeManager] Created ${gitignorePath} with '${pattern}'`)
  }
}

/**
 * 为指定任务创建一个 Git worktree（支持单/多 Git 仓库）。
 *
 * @param workspaceRoot - 工作空间根路径
 * @param taskLabel - 任务标识，如 "bug-123" 或 "task-456"
 * @param sessionId - 会话 ID
 */
export async function createWorktree(workspaceRoot: string, taskLabel?: string, sessionId?: string): Promise<WorktreeInfo> {
  const dirName = getWorktreeDirName(taskLabel, sessionId)
  const branch = getWorktreeBranch(dirName)

  // 1. 检查 workspaceRoot 是否处于某个 Git 仓库中 (单仓库模式)
  const singleRepoRoot = await findGitRoot(workspaceRoot)

  if (singleRepoRoot) {
    // --- 单仓库模式 ---
    const worktreePath = join(singleRepoRoot, dirName)

    try {
      await access(worktreePath)
      console.log(`[WorktreeManager] Reusing existing single-repo worktree: ${worktreePath}`)
      const baseBranch = await getCurrentBranch(singleRepoRoot)
      return { path: worktreePath, branch, repoRoot: singleRepoRoot, dirName, baseBranch }
    } catch {}

    await ensureGitIgnore(singleRepoRoot)
    const currentBranch = await getCurrentBranch(singleRepoRoot)

    if (await branchExists(singleRepoRoot, branch)) {
      await execGit(["worktree", "add", worktreePath, branch], { cwd: singleRepoRoot })
      console.log(`[WorktreeManager] Created worktree with existing branch: ${worktreePath}`)
    } else {
      await execGit([
        "worktree", "add",
        "-b", branch,
        worktreePath,
        currentBranch
      ], { cwd: singleRepoRoot })
      console.log(`[WorktreeManager] Created worktree: ${worktreePath} (branch: ${branch})`)
    }

    return { path: worktreePath, branch, repoRoot: singleRepoRoot, dirName, baseBranch: currentBranch }
  }

  // --- 多仓库模式 ---
  // 2. 递归寻找 workspaceRoot 包含的所有 Git 仓库
  const gitRepos = await findGitRepos(workspaceRoot)
  if (gitRepos.length === 0) {
    throw new Error(`工作空间 ${workspaceRoot} 不包含任何 Git 仓库，无法启用 worktree 隔离模式`)
  }

  const worktreeRoot = join(workspaceRoot, dirName)
  await mkdir(worktreeRoot, { recursive: true })

  console.log(`[WorktreeManager] Found ${gitRepos.length} Git repos. Building virtual worktree workspace at: ${worktreeRoot}`)

  // 3. 对每个发现的 Git 仓库创建 worktree 映射
  const createdPaths: Array<{ repoPath: string; targetPath: string }> = []
  const errors: Array<{ repoPath: string; error: string }> = []

  let multiRepoBaseBranch: string | undefined
  for (const repoPath of gitRepos) {
    const relPath = relative(workspaceRoot, repoPath)
    const targetPath = join(worktreeRoot, relPath)

    // 创建 parent 文件夹
    await mkdir(dirname(targetPath), { recursive: true })

    // 检查是否已存在
    try {
      await access(targetPath)
      console.log(`[WorktreeManager] Sub-worktree already exists, skipping: ${targetPath}`)
      continue
    } catch {}

    await ensureGitIgnore(repoPath)
    const currentBranch = await getCurrentBranch(repoPath)

      multiRepoBaseBranch = multiRepoBaseBranch || currentBranch
    try {
      if (await branchExists(repoPath, branch)) {
        await execGit(["worktree", "add", targetPath, branch], { cwd: repoPath })
      } else {
        await execGit([
          "worktree", "add",
          "-b", branch,
          targetPath,
          currentBranch
        ], { cwd: repoPath })
      }
      console.log(`[WorktreeManager] Created sub-worktree for ${relPath} at ${targetPath}`)
      createdPaths.push({ repoPath, targetPath })
    } catch (err: any) {
      const msg = `Failed to create worktree for ${relPath}: ${err.message}`
      console.error(`[WorktreeManager] ${msg}`)
      errors.push({ repoPath, error: msg })
    }
  }

  // 如果有失败的 worktree 创建，回滚已创建的部分
  if (errors.length > 0) {
    console.warn(`[WorktreeManager] ${errors.length}/${gitRepos.length} worktree(s) failed. Rolling back ${createdPaths.length} created worktree(s).`)
    for (const { repoPath, targetPath } of createdPaths) {
      try {
        await execGit(["worktree", "remove", "--force", targetPath], { cwd: repoPath })
        if (await branchExists(repoPath, branch)) {
          await execGit(["branch", "-D", branch], { cwd: repoPath })
        }
      } catch (rollbackErr: any) {
        console.error(`[WorktreeManager] Rollback failed for ${targetPath}: ${rollbackErr.message}`)
      }
    }
    // 清理已创建的 worktree 根目录
    try {
      await rm(worktreeRoot, { recursive: true, force: true })
    } catch {}
    throw new Error(`多仓库 worktree 创建失败: ${errors.map(e => e.error).join("; ")}`)
  }

  // 4. 对其他非 Git 顶级项在虚拟工作区中创建 symlink
  const SENSITIVE_PATTERNS = new Set([
    ".env", ".env.local", ".env.development", ".env.production",
    ".npmrc", ".yarnrc", ".git-credentials", ".gitconfig",
    ".ssh", ".gnupg", "credentials.json", "service-account.json",
    "node_modules", "dist", "build", ".cache", ".DS_Store"
  ])
  try {
    const topEntries = await readdir(workspaceRoot, { withFileTypes: true })
    for (const entry of topEntries) {
      const name = entry.name
      if (name.startsWith("worktree-")) {
        continue // 排除其他 worktree 目录
      }
      if (name.startsWith(".") || SENSITIVE_PATTERNS.has(name)) {
        continue // 跳过隐藏文件和敏感文件
      }
      const originalPath = join(workspaceRoot, name)
      const targetPath = join(worktreeRoot, name)

      // 如果这个项是已经被映射过的 Git 仓库（或者它属于某 Git 仓库的路径），则跳过
      const isMappedGit = gitRepos.some(repo => repo === originalPath || repo.startsWith(originalPath + "/"))
      if (isMappedGit) {
        continue
      }

      try {
        await rm(targetPath, { recursive: true, force: true }).catch(() => {})
        await symlink(originalPath, targetPath)
      } catch (symErr: any) {
        console.warn(`[WorktreeManager] Failed to symlink ${originalPath} to ${targetPath}: ${symErr.message}`)
      }
    }
  } catch (err: any) {
    console.error(`[WorktreeManager] Error mapping non-git files to virtual workspace: ${err.message}`)
  }

  return {
    path: worktreeRoot,
    branch,
    repoRoot: workspaceRoot,
    baseBranch: multiRepoBaseBranch || "main",
    dirName
  }
}

/**
 * 递归查找某个目录下的所有 Git worktree 目录（以包含 .git 文件为准）。
 */
async function findWorktreesInPath(dir: string, maxDepth = 5, currentDepth = 0): Promise<string[]> {
  if (currentDepth >= maxDepth) return []
  const result: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    
    // 检查当前目录下是否有名为 .git 的文件
    let hasGitFile = false
    for (const entry of entries) {
      if (entry.name === ".git") {
        try {
          const st = await stat(join(dir, ".git"))
          if (st.isFile()) {
            hasGitFile = true
          }
        } catch {}
        break
      }
    }
    
    if (hasGitFile) {
      result.push(dir)
      return result
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const name = entry.name
        if (name.startsWith(".") || name === "node_modules" || name === "dist" || name === "build") {
          continue
        }
        const nested = await findWorktreesInPath(join(dir, name), maxDepth, currentDepth + 1)
        result.push(...nested)
      }
    }
  } catch {}
  return result
}

/**
 * 自动清理指定会话所创建的所有 worktree（支持多仓库和单仓库）。
 */
export async function cleanupWorktreesForSession(
  workspaceRoot: string,
  taskLabel?: string,
  sessionId?: string,
  deleteBranch = false,
  dirNameOverride?: string
): Promise<void> {
  const dirName = dirNameOverride || getWorktreeDirName(taskLabel, sessionId)
  const worktreeRootPath = join(workspaceRoot, dirName)

  try {
    await access(worktreeRootPath)
  } catch {
    return // 目录不存在，无需清理
  }

  console.log(`[WorktreeManager] Starting cleanup for session worktree: ${worktreeRootPath}`)

  // 1. 查找虚拟目录下所有的 git worktrees
  const worktrees = await findWorktreesInPath(worktreeRootPath)
  const deletedBranches = new Set<string>()

  for (const wtPath of worktrees) {
    const relPath = relative(worktreeRootPath, wtPath)
    const mainRepo = join(workspaceRoot, relPath)

    try {
      await execGit(["worktree", "remove", "--force", wtPath], { cwd: mainRepo })
      console.log(`[WorktreeManager] Successfully removed worktree at ${wtPath}`)
    } catch (err: any) {
      console.warn(`[WorktreeManager] Failed to remove worktree at ${wtPath} from repo ${mainRepo}: ${err.message}`)
    }

    // 可选：删除关联的分支（同一 repo+branch 组合只删除一次）
    if (deleteBranch) {
      const branch = getWorktreeBranch(dirName)
      const branchKey = `${mainRepo}:${branch}`
      if (!deletedBranches.has(branchKey)) {
        deletedBranches.add(branchKey)
        try {
          await execGit(["branch", "-D", branch], { cwd: mainRepo })
          console.log(`[WorktreeManager] Deleted branch ${branch} in repo ${mainRepo}`)
        } catch {
          // 分支可能已被删除或不存在
        }
      }
    }
  }

  // 2. 清除整个虚拟工作区目录（包含所有 symlink）
  try {
    await rm(worktreeRootPath, { recursive: true, force: true })
    console.log(`[WorktreeManager] Cleaned up worktree root directory: ${worktreeRootPath}`)
  } catch (err: any) {
    console.error(`[WorktreeManager] Failed to remove worktree root directory: ${err.message}`)
  }

  // 3. 清理各仓库的 worktree 元数据残留
  const prunedRepos = new Set<string>()
  for (const wtPath of worktrees) {
    try {
      const mainRepo = join(workspaceRoot, relative(worktreeRootPath, wtPath))
      if (!prunedRepos.has(mainRepo)) {
        prunedRepos.add(mainRepo)
        await execGit(["worktree", "prune"], { cwd: mainRepo })
        console.log(`[WorktreeManager] Pruned worktree metadata in ${mainRepo}`)
      }
    } catch {
      // prune 失败不阻塞
    }
  }
}

/**
 * 计算 worktree 模式下 Agent 应使用的 cwd。
 */
export function resolveWorktreeCwd(originalRootPath: string, repoRoot: string, worktreePath: string): string {
  if (originalRootPath === repoRoot) {
    return worktreePath
  }
  const relativePath = originalRootPath.slice(repoRoot.length)
  return join(worktreePath, relativePath)
}
