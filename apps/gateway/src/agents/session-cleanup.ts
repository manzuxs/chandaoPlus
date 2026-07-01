import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"

/**
 * 检查并清理与特定 sessionId 关联的残留后台进程及锁文件。
 *
 * 当上一次会话被异常终止（如前端断连、网关超时等）时，
 * 占用该会话的旧进程或锁文件可能会残留在本地 `~/.claude/sessions/` 目录中。
 * 在下一次以 `--resume` 方式恢复该会话前，本函数会自动寻找对应的进程 PID，
 * 检查其系统活跃状态，强制终止该进程并删除残留的锁文件，防止恢复会话时遇到锁独占询问而发生 EOF 崩溃。
 *
 * @param sessionId 当前运行请求的会话 ID
 * @param agentLabel 日志标签，例如 "Claude Code", "Qcode"
 */
export async function cleanupSessionLock(sessionId: string, agentLabel: string): Promise<void> {
  if (!sessionId) return

  const sessionsDir = path.join(os.homedir(), ".claude", "sessions")
  try {
    const stat = await fs.stat(sessionsDir).catch(() => null)
    if (!stat || !stat.isDirectory()) {
      return
    }

    const files = await fs.readdir(sessionsDir)
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      const filePath = path.join(sessionsDir, file)
      try {
        const content = await fs.readFile(filePath, "utf-8")
        const sessionInfo = JSON.parse(content)

        if (sessionInfo && sessionInfo.sessionId === sessionId) {
          const pid = sessionInfo.pid
          if (typeof pid === "number") {
            // 检查 PID 是否仍存活在系统进程中
            let exists = false
            try {
              process.kill(pid, 0)
              exists = true
            } catch (err: any) {
              // 错误码为 ESRCH (No such process) 代表进程已死亡
              exists = err.code !== "ESRCH"
            }

            if (exists) {
              console.warn(`[${agentLabel}] 发现残留僵尸进程 PID ${pid} 占用会话 ${sessionId}，正在强制将其终止...`)
              try {
                process.kill(pid, "SIGKILL")
              } catch (killErr: any) {
                console.error(`[${agentLabel}] 强制终止进程 PID ${pid} 失败:`, killErr.message)
              }
            }
          }

          // 强制删除锁配置文件，解除占用状态
          console.warn(`[${agentLabel}] 正在清理残留的会话锁文件: ${file}`)
          await fs.unlink(filePath).catch(() => null)
        }
      } catch (fileErr: any) {
        // 单个文件解析错误跳过，不阻断主流程
        console.error(`[${agentLabel}] 读取会话锁文件 ${file} 失败:`, fileErr.message)
      }
    }
  } catch (err: any) {
    console.error(`[${agentLabel}] 清理会话锁失败:`, err.message)
  }
}
