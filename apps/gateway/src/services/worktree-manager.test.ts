import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { findGitRoot, findGitRepos, createWorktree, cleanupWorktreesForSession, resolveWorktreeCwd } from "./worktree-manager"

const execFileAsync = promisify(execFile)

describe("Worktree Manager", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "worktree-manager-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("findGitRoot returns null for non-git directory", async () => {
    const root = await findGitRoot(tmpDir)
    expect(root).toBeNull()
  })

  it("findGitRoot returns repo path for git directory", async () => {
    // Initialize a git repo in tmpDir
    await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir })
    // Git requires at least one commit for worktree to work properly later
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: tmpDir })
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: tmpDir })
    writeFileSync(path.join(tmpDir, "dummy.txt"), "hello")
    await execFileAsync("git", ["add", "dummy.txt"], { cwd: tmpDir })
    await execFileAsync("git", ["commit", "-m", "initial commit"], { cwd: tmpDir })

    const root = await findGitRoot(tmpDir)
    expect(root).not.toBeNull()
    expect(realpathSync(root!)).toBe(realpathSync(tmpDir))
  })

  it("findGitRepos finds nested git repositories", async () => {
    // Create nested directory structure:
    // tmpDir (not a git repo)
    //  ├── repo-a (git repo)
    //  └── repo-b (git repo)
    //  └── non-git (regular dir)
    const repoA = path.join(tmpDir, "repo-a")
    const repoB = path.join(tmpDir, "repo-b")
    const nonGit = path.join(tmpDir, "non-git")

    mkdirSync(repoA)
    mkdirSync(repoB)
    mkdirSync(nonGit)

    // Init git in repoA and repoB
    await execFileAsync("git", ["init", "-b", "main"], { cwd: repoA })
    await execFileAsync("git", ["init", "-b", "main"], { cwd: repoB })

    const repos = await findGitRepos(tmpDir)
    expect(repos).toHaveLength(2)
    const sortedRepos = repos.map(r => realpathSync(r)).sort()
    expect(sortedRepos).toContain(realpathSync(repoA))
    expect(sortedRepos).toContain(realpathSync(repoB))
  })

  it("createWorktree and cleanupWorktreesForSession in single-repo mode", async () => {
    // Init main repo in tmpDir
    await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir })
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: tmpDir })
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: tmpDir })
    writeFileSync(path.join(tmpDir, "dummy.txt"), "hello")
    await execFileAsync("git", ["add", "dummy.txt"], { cwd: tmpDir })
    await execFileAsync("git", ["commit", "-m", "initial commit"], { cwd: tmpDir })

    // Create worktree
    const session1Id = "11111111-2222-3333-4444-555555555555"
    const info = await createWorktree(tmpDir, "bug-123", session1Id)

    expect(info.path).toContain("worktree-bug-123")
    expect(info.dirName).toBe("worktree-bug-123")
    expect(info.branch).toBe("chandaoplus/bug-123")

    // Check .gitignore contains worktree-*
    const gitignoreContent = readFileSync(path.join(tmpDir, ".gitignore"), "utf8")
    expect(gitignoreContent).toContain("worktree-*")

    // Cleanup worktree
    await cleanupWorktreesForSession(tmpDir, "bug-123", session1Id, true)

    // Check directory is removed
    expect(() => readFileSync(path.join(info.path, "dummy.txt"))).toThrow()
  })

  it("createWorktree and cleanupWorktreesForSession in multi-repo mode", async () => {
    // Create nested structure:
    // tmpDir
    //  ├── repo-1 (git repo)
    //  ├── non-git-dir
    //  └── config.json
    const repo1 = path.join(tmpDir, "repo-1")
    const nonGitDir = path.join(tmpDir, "non-git-dir")
    const configFile = path.join(tmpDir, "config.json")

    mkdirSync(repo1)
    mkdirSync(nonGitDir)
    writeFileSync(configFile, '{"key": "value"}')
    writeFileSync(path.join(nonGitDir, "settings.txt"), "some config")

    // Init git in repo1
    await execFileAsync("git", ["init", "-b", "main"], { cwd: repo1 })
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: repo1 })
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repo1 })
    writeFileSync(path.join(repo1, "code.js"), "console.log(1)")
    await execFileAsync("git", ["add", "code.js"], { cwd: repo1 })
    await execFileAsync("git", ["commit", "-m", "repo1 commit"], { cwd: repo1 })

    // Create multi-repo worktree
    const session2Id = "22222222-3333-4444-5555-666666666666"
    const info = await createWorktree(tmpDir, "task-999", session2Id)

    const worktreeRoot = info.path
    expect(worktreeRoot).toContain("worktree-task-999")

    // Check repo-1 has a worktree under worktreeRoot/repo-1
    const wtRepo1Code = readFileSync(path.join(worktreeRoot, "repo-1", "code.js"), "utf8")
    expect(wtRepo1Code).toBe("console.log(1)")

    // Check config.json and non-git-dir are symlinked
    const wtConfig = readFileSync(path.join(worktreeRoot, "config.json"), "utf8")
    expect(wtConfig).toBe('{"key": "value"}')

    const wtSettings = readFileSync(path.join(worktreeRoot, "non-git-dir", "settings.txt"), "utf8")
    expect(wtSettings).toBe("some config")

    // Cleanup multi-repo worktree
    await cleanupWorktreesForSession(tmpDir, "task-999", session2Id, true)

    // Check directory is completely removed
    expect(() => readFileSync(path.join(worktreeRoot, "config.json"))).toThrow()
  })

  it("resolveWorktreeCwd works for subdirectories", () => {
    const originalRoot = "/Users/test/project/apps/gateway"
    const repoRoot = "/Users/test/project"
    const worktreePath = "/Users/test/project/worktree-session-abc"

    const resolved = resolveWorktreeCwd(originalRoot, repoRoot, worktreePath)
    expect(resolved).toBe("/Users/test/project/worktree-session-abc/apps/gateway")
  })
})

