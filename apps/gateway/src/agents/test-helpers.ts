import { EventEmitter } from "node:events"
import { vi } from "vitest"

/**
 * 创建模拟子进程，用于各 adapter 测试。
 * 使用 EventEmitter 模拟 stdout/stderr 流和 close/error 事件。
 */
export function createMockChildProcess(options: {
  stdoutLines?: string[]
  closeCode?: number
  autoClose?: boolean
} = {}): EventEmitter & {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  stdout: EventEmitter
  stderr: EventEmitter
  pid?: number
} {
  const { stdoutLines = [], closeCode = 0, autoClose = true } = options
  const child = new EventEmitter() as any
  child.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = 12345

  if (autoClose) {
    queueMicrotask(() => {
      if (stdoutLines.length > 0) {
        child.stdout.emit("data", stdoutLines.join("\n") + "\n")
      }
      child.emit("close", closeCode)
    })
  }

  return child
}
