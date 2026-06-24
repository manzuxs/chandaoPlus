import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from "node:child_process"

/**
 * Spawn a child process with proper process-tree cleanup.
 *
 * Uses `detached: true` so the child becomes a process-group leader.
 * On abort, `process.kill(-child.pid, signal)` kills the entire process
 * group — the child AND all of its descendants (pnpm, eslint, etc.).
 */
export function spawnWithCleanup(
  command: string,
  args: string[],
  options: Omit<SpawnOptions, "detached" | "stdio">,
  signal?: AbortSignal
): ChildProcessWithoutNullStreams {
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  } as SpawnOptions)
  // detached:true confuses TS overload resolution; we always pipe stdio
  const proc = child as unknown as ChildProcessWithoutNullStreams
  const killTree = (killSignal: NodeJS.Signals) => {
    if (!child.pid) return
    try {
      // Negative pid = process group; kills the child and all its descendants
      process.kill(-child.pid, killSignal)
    } catch {
      // Fallback: child may not be a process group leader on some platforms
      try { child.kill(killSignal) } catch { /* already dead */ }
    }
  }

  if (signal) {
    const onAbort = () => {
      killTree("SIGTERM")
      // Grace period before force-kill
      setTimeout(() => {
        try { killTree("SIGKILL") } catch { /* already dead */ }
      }, 5000)
    }
    signal.addEventListener("abort", onAbort, { once: true })
  }

  return proc
}

/**
 * Register cleanup so spawned process trees don't survive the parent process.
 * Call this in the gateway's startup to clean up on exit.
 */
export function registerProcessCleanup(children: Set<ChildProcessWithoutNullStreams>): void {
  const cleanup = () => {
    for (const child of children) {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL")
      } catch { /* already dead */ }
    }
  }

  // Best-effort cleanup on process exit
  process.once("beforeExit", cleanup)
  process.once("exit", cleanup)
}
