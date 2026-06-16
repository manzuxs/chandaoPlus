import { useState, useEffect, useCallback, useRef } from "react"
import type { WorkspaceProfile, ChatMessage, ChatCommand, Skill, PageCapture } from "@chandaoplus/shared"
import { captureActiveTabPage } from "../../lib/page-capture"

type SessionState = {
  messages: ChatMessage[]
  sending: boolean
  statusText: string
  agent?: "claude-code" | "codex" | "opencode"
  model?: string
  effort?: "low" | "medium" | "high" | "xhigh" | "max"
  permissionMode?: "ask" | "auto" | "full" | "custom"
  lockedPage?: PageCapture
  runningTaskId?: string
}

const getBugId = (page?: PageCapture) => {
  if (page?.metadata?.pageKind !== "zentao-bug-detail") return undefined
  return typeof page.metadata.bugId === "string" ? page.metadata.bugId : undefined
}

async function readSseStream(response: Response, onChunk: (chunk: any) => void) {
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (reader) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("data: ")) {
        try {
          onChunk(JSON.parse(trimmed.slice(6)))
        } catch {
          // Ignore partial SSE chunk parses
        }
      }
    }
  }
}

export function useChatSession(workspaceId: string) {
  const [workspaces, setWorkspaces] = useState<WorkspaceProfile[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [sessionStates, setSessionStates] = useState<Record<string, SessionState>>({})
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionVersion, setSessionVersion] = useState(0)
  const abortControllersRef = useRef<Record<string, AbortController>>({})
  const tempSessionKey = workspaceId ? `temp:${workspaceId}` : "temp"
  // 用 ref 同步持有最新 sessionStates，避免在异步回调里读到旧快照
  const sessionStatesRef = useRef<typeof sessionStates>({})
  // 每次渲染时更新 ref（不触发重新渲染，仅为同步读取用）
  sessionStatesRef.current = sessionStates

  const lastSeqRef = useRef<Record<string, number>>({})

  const reloadSessionMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:3210/api/sessions/${id}`)
      if (res.ok) {
        const session = await res.json()
        if (session.messages) {
          setSessionStates((prev) => ({
            ...prev,
            [id]: {
              ...(prev[id] || { messages: [], sending: false, statusText: "", agent: undefined, model: "default", effort: "medium", permissionMode: "full" }),
              messages: session.messages,
              runningTaskId: session.runningTaskId
            }
          }))
        }
      }
    } catch (err) {
      console.error("Failed to reload session messages:", err)
    }
  }, [])



  const connectTaskStream = useCallback(async (taskId: string, key: string) => {
    if (abortControllersRef.current[key]) return

    const controller = new AbortController()
    abortControllersRef.current[key] = controller
    const lastSeq = lastSeqRef.current[key] ?? -1
    const fromSeq = lastSeq >= 0 ? lastSeq + 1 : 0

    const latestState = sessionStatesRef.current[key]
    const lastMsg = latestState?.messages[latestState.messages.length - 1]
    let assistantContent = (fromSeq > 0 && lastMsg?.role === "assistant") ? lastMsg.content : ""

    setSessionStates((prev) => {
      const state = prev[key] || { messages: [], sending: false, statusText: "" }
      return {
        ...prev,
        [key]: {
          ...state,
          sending: true,
          runningTaskId: taskId,
          statusText: state.statusText || "正在恢复任务输出..."
        }
      }
    })

    let gotTerminalEvent = false

    try {
      const response = await fetch(`http://127.0.0.1:3210/api/chat/tasks/${taskId}/stream?from=${fromSeq}`, {
        signal: controller.signal
      })
      if (!response.ok) {
        if (response.status === 404) {
          await reloadSessionMessages(key)
        }
        const errorMsg = await response.json().catch(() => ({ error: "Task stream error" }))
        throw new Error(errorMsg.error || `HTTP ${response.status}`)
      }

      await readSseStream(response, (chunk) => {
        if (typeof chunk.seq === "number") {
          lastSeqRef.current[key] = chunk.seq
        }
        if (chunk.type === "done" || chunk.type === "error") {
          gotTerminalEvent = true
        }

        if (chunk.type === "status" || chunk.type === "progress") {
          setSessionStates((prev) => {
            const state = prev[key] || { messages: [], sending: true, statusText: "" }
            return {
              ...prev,
              [key]: {
                ...state,
                statusText: chunk.content
              }
            }
          })
        } else if (chunk.type === "text") {
          assistantContent += chunk.content
          setSessionStates((prev) => {
            const state = prev[key] || { messages: [], sending: true, statusText: "" }
            const nextMessages = [...state.messages]
            const last = nextMessages[nextMessages.length - 1]
            if (last?.role === "assistant") {
              nextMessages[nextMessages.length - 1] = { ...last, content: assistantContent }
            } else {
              nextMessages.push({ role: "assistant", content: assistantContent })
            }
            return {
              ...prev,
              [key]: {
                ...state,
                messages: nextMessages
              }
            }
          })
        } else if (chunk.type === "error") {
          setSessionStates((prev) => {
            const state = prev[key] || { messages: [], sending: true, statusText: "" }
            const nextMessages = [...state.messages]
            nextMessages.push({ role: "assistant", content: `任务失败: ${chunk.content}` })
            return {
              ...prev,
              [key]: {
                ...state,
                messages: nextMessages,
                statusText: `错误: ${chunk.content}`
              }
            }
          })
        }
      })

    } catch (err: any) {
      if (err.name !== "AbortError") {
        setSessionStates((prev) => {
          const state = prev[key] || { messages: [], sending: false, statusText: "" }
          return {
            ...prev,
            [key]: {
              ...state,
              statusText: `任务连接断开: ${err.message}`
            }
          }
        })
      }
    } finally {
      if (abortControllersRef.current[key] === controller) {
        delete abortControllersRef.current[key]
      }
      const isAborted = controller.signal.aborted
      const currentLatestState = sessionStatesRef.current[key]
      const currentTaskId = currentLatestState?.runningTaskId

      if (!gotTerminalEvent && currentTaskId && !isAborted) {
        setSessionStates((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            statusText: "连接断开，正在尝试重连..."
          }
        }))
        setTimeout(() => {
          const curState = sessionStatesRef.current[key]
          if (curState?.runningTaskId === currentTaskId && !controller.signal.aborted) {
            connectTaskStream(currentTaskId, key).catch(console.error)
          }
        }, 1500)
      } else {
        if (gotTerminalEvent || isAborted) {
          setSessionStates((prev) => {
            const state = prev[key] || { messages: [], sending: false, statusText: "" }
            return {
              ...prev,
              [key]: {
                ...state,
                sending: false,
                runningTaskId: undefined,
                statusText: isAborted && state.statusText.startsWith("停止失败") ? state.statusText : ""
              }
            }
          })
        } else {
          setSessionStates((prev) => ({
            ...prev,
            [key]: {
              ...prev[key],
              sending: false
            }
          }))
        }
      }
      setSessionVersion((v) => v + 1)
    }
  }, [reloadSessionMessages])

  const stopRunningTask = useCallback(async (taskId: string) => {
    const response = await fetch(`http://127.0.0.1:3210/api/chat/tasks/${taskId}/stop`, { method: "POST" })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      throw new Error(err.error || `HTTP ${response.status}`)
    }
  }, [])

  const loadWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("http://127.0.0.1:3210/api/workspaces")
      if (res.ok) {
        const list = await res.json()
        setWorkspaces(list)
      }
    } catch (err) {
      console.error("Failed to load workspaces from gateway:", err)
    }
  }, [])

  const loadSkills = useCallback(async () => {
    try {
      const res = await fetch("http://127.0.0.1:3210/api/skills")
      if (res.ok) {
        const list = await res.json()
        setSkills(list)
      }
    } catch (err) {
      console.error("Failed to load skills from gateway:", err)
    }
  }, [])

  useEffect(() => {
    loadWorkspaces()
    loadSkills()
  }, [loadWorkspaces, loadSkills])

  // Restore session and load history when workspaceId changes
  useEffect(() => {
    if (!workspaceId) return
    let active = true

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(`session_${workspaceId}`).then((result: Record<string, any>) => {
        if (!active) return
        const stored = result[`session_${workspaceId}`]
        if (stored) {
          setSessionId(stored)
          fetch(`http://127.0.0.1:3210/api/sessions/${stored}`)
            .then((res) => {
              if (!res.ok) throw new Error("Session not found")
              return res.json()
            })
            .then((session) => {
              if (!active) return
              if (session.messages) {
                setSessionStates((prev) => ({
                  ...prev,
                  [stored]: {
                    messages: session.messages,
                    sending: prev[stored]?.sending || false,
                    statusText: prev[stored]?.statusText || "",
                    agent: session.agent || prev[stored]?.agent,
                    model: prev[stored]?.model || session.model || "default",
                    effort: prev[stored]?.effort || session.effort || "medium",
                    permissionMode: prev[stored]?.permissionMode || session.permissionMode || "full",
                    runningTaskId: session.runningTaskId
                  }
                }))
                if (session.runningTaskId && session.runningStatus) {
                  connectTaskStream(session.runningTaskId, stored).catch((err) => {
                    console.error("Failed to reconnect running task:", err)
                  })
                }
              }
            })
            .catch(() => {
              if (!active) return
              // 如果服务端拉取失败，判定为失效会话，清理并回退
              setSessionId(null)
              if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove(`session_${workspaceId}`).catch(() => {})
              }
            })
        } else {
          setSessionId(null)
        }
      })
    }

    return () => {
      active = false
    }
  }, [workspaceId, connectTaskStream])

  // Persist sessionId to chrome.storage when it changes
  useEffect(() => {
    if (sessionId && workspaceId && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [`session_${workspaceId}`]: sessionId })
    }
  }, [sessionId, workspaceId])

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      const handleProgressMessage = (message: any) => {
        if (message.type === "CAPTURE_PROGRESS") {
          const currentActiveId = sessionId || tempSessionKey
          setSessionStates((prev) => {
            const existing = prev[currentActiveId] || {}
            return {
              ...prev,
              [currentActiveId]: {
                ...existing,
                messages: existing.messages || [],
                sending: existing.sending || false,
                statusText: message.content
              }
            }
          })
        }
      }
      chrome.runtime.onMessage.addListener(handleProgressMessage)
      return () => {
        chrome.runtime.onMessage.removeListener(handleProgressMessage)
      }
    }
  }, [sessionId, tempSessionKey])

  const addWorkspace = async (profile: WorkspaceProfile) => {
    try {
      const res = await fetch("http://127.0.0.1:3210/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      })
      if (res.ok) {
        await loadWorkspaces()
      } else {
        const err = await res.json()
        throw new Error(err.error || "Failed to save workspace")
      }
    } catch (err) {
      console.error(err)
      alert("保存工作空间失败")
    }
  }

  const updateWorkspace = async (profile: WorkspaceProfile) => {
    try {
      const res = await fetch(`http://127.0.0.1:3210/api/workspaces/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      })
      if (res.ok) {
        await loadWorkspaces()
      } else {
        const err = await res.json()
        throw new Error(err.error || "Failed to update workspace")
      }
    } catch (err) {
      console.error(err)
      alert("更新工作空间失败")
    }
  }

  const deleteWorkspace = async (id: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:3210/api/workspaces/${id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        await loadWorkspaces()
      } else {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete workspace")
      }
    } catch (err) {
      console.error(err)
      alert("删除工作空间失败")
    }
  }

  const deleteSession = useCallback(async (id: string, runningTaskId?: string) => {
    try {
      const taskId = runningTaskId || sessionStatesRef.current[id]?.runningTaskId
      if (taskId) {
        await stopRunningTask(taskId).catch((err) => {
          console.error("Failed to stop task before deleting session:", err)
        })
      }
      // 同时也 abort 正在运行的请求
      abortControllersRef.current[id]?.abort()
      delete abortControllersRef.current[id]

      const res = await fetch(`http://127.0.0.1:3210/api/sessions/${id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        setSessionStates((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        if (id === sessionId) {
          setSessionId(null)
          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && workspaceId) {
            await chrome.storage.local.remove(`session_${workspaceId}`)
          }
        }
        setSessionVersion((v) => v + 1)
      } else {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete session")
      }
    } catch (err) {
      console.error(err)
      alert("删除会话失败")
    }
  }, [sessionId, workspaceId, stopRunningTask])

  const newSession = useCallback(() => {
    // 放弃当前工作空间的新会话时，如果临时会话正在发送，将其 abort
    abortControllersRef.current[tempSessionKey]?.abort()
    delete abortControllersRef.current[tempSessionKey]

    setSessionId(null)
    setSessionStates((prev) => {
      const next = { ...prev }
      delete next[tempSessionKey]
      return next
    })
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && workspaceId) {
      Promise.resolve(chrome.storage.local.remove(`session_${workspaceId}`)).catch(() => {})
    }
  }, [workspaceId, tempSessionKey])

  const setSessionConfig = useCallback((config: {
    agent?: "claude-code" | "codex" | "opencode"
    model?: string
    effort?: "low" | "medium" | "high" | "xhigh" | "max"
    permissionMode?: "ask" | "auto" | "full" | "custom"
  }) => {
    const key = sessionId || tempSessionKey
    setSessionStates((prev) => {
      const state = prev[key] || { messages: [], sending: false, statusText: "", agent: undefined, model: "default", effort: "medium", permissionMode: "full" }
      return {
        ...prev,
        [key]: {
          ...state,
          ...config
        }
      }
    })
  }, [sessionId, tempSessionKey])

  const loadSession = useCallback(async (id: string) => {
    // 先切换 sessionId，让 UI 立即响应
    setSessionId(id)

    // 通过 ref 同步读取最新缓存，避免闭包旧值问题
    const cached = sessionStatesRef.current[id]
    if (cached?.messages?.length > 0) {
      if (cached.runningTaskId && !abortControllersRef.current[id]) {
        connectTaskStream(cached.runningTaskId, id).catch((err) => {
          console.error("Failed to reconnect cached running task:", err)
        })
      }
      // 已有缓存，直接使用，不发请求
      return
    }

    // 无缓存，设置加载占位然后拉取
    setSessionStates((prev) => ({
      ...prev,
      [id]: prev[id] || { messages: [], sending: false, statusText: "加载中..." }
    }))

    try {
      const res = await fetch(`http://127.0.0.1:3210/api/sessions/${id}`)
      if (!res.ok) {
        throw new Error("Session not found")
      }
      const session = await res.json()
      if (session.messages) {
        setSessionStates((prev) => ({
          ...prev,
          [id]: {
            messages: session.messages,
            sending: prev[id]?.sending || false,
            statusText: "",
            agent: session.agent || prev[id]?.agent,
            model: prev[id]?.model || session.model || "default",
            effort: prev[id]?.effort || session.effort || "medium",
            permissionMode: prev[id]?.permissionMode || session.permissionMode || "full",
            runningTaskId: session.runningTaskId
          }
        }))
        if (session.runningTaskId && session.runningStatus) {
          connectTaskStream(session.runningTaskId, id).catch((err) => {
            console.error("Failed to reconnect running task:", err)
          })
        }
      }
    } catch (err) {
      console.error("Failed to load session:", err)
      setSessionStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], statusText: "" }
      }))
      // 切换失败（比如会话已被从后端物理删除），回退到新会话状态
      setSessionId(null)
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && workspaceId) {
        chrome.storage.local.remove(`session_${workspaceId}`).catch(() => {})
      }
    }
  }, [workspaceId, connectTaskStream])

  const send = async (params: {
    workspaceId: string
    agent: "claude-code" | "codex" | "opencode"
    command: ChatCommand
    input: string
  }) => {
    let activeId = sessionId
    const targetKey = activeId || tempSessionKey
    
    // Check if currently sending for this specific targetKey
    if (sessionStates[targetKey]?.sending) return

    const userMsg: ChatMessage = { role: "user", content: params.input || `执行命令: ${params.command}` }
    
    setSessionStates((prev) => {
      const state = prev[targetKey] || { messages: [], sending: false, statusText: "", agent: undefined, model: "default", effort: "medium", permissionMode: "full" }
      return {
        ...prev,
        [targetKey]: {
          ...state,
          messages: [...state.messages, userMsg, { role: "assistant", content: "" }],
          sending: true,
          statusText: "正在捕获页面内容..."
        }
      }
    })


    let gotTerminalEvent = false
    let isAssistantMsgAdded = true
    let assistantMsg: ChatMessage = { role: "assistant", content: "" }
    let finalStatusText = ""

    // 取消上一个针对该会话的请求（如有）
    abortControllersRef.current[targetKey]?.abort()
    const controller = new AbortController()
    abortControllersRef.current[targetKey] = controller

    try {
      // Step 1: Capture page
      const capturedPage = await captureActiveTabPage()
      const latestState = sessionStatesRef.current[targetKey]
      const lockedBugId = getBugId(latestState?.lockedPage)
      const capturedBugId = getBugId(capturedPage)
      let pageCapture = capturedPage

      if (lockedBugId && capturedBugId && capturedBugId !== lockedBugId) {
        const statusText = `当前会话绑定 BUG #${lockedBugId}，但当前页面是 BUG #${capturedBugId}。请新建会话或回到原 BUG 页面。`
        setSessionStates((prev) => {
          const state = prev[targetKey] || { messages: [], sending: false, statusText: "" }
          const nextMessages = [...state.messages]
          const last = nextMessages[nextMessages.length - 1]
          if (last?.role === "assistant" && !last.content) {
            nextMessages.pop()
          }
          const nextLast = nextMessages[nextMessages.length - 1]
          if (nextLast?.role === "user" && nextLast.content === userMsg.content) {
            nextMessages.pop()
          }
          return {
            ...prev,
            [targetKey]: {
              ...state,
              messages: nextMessages,
              sending: false,
              statusText
            }
          }
        })
        return
      }

      if (lockedBugId && latestState?.lockedPage && !capturedBugId) {
        pageCapture = latestState.lockedPage
        finalStatusText = `使用已锁定 BUG #${lockedBugId} 上下文`
      }

      setSessionStates((prev) => {
        const key = activeId || tempSessionKey
        const state = prev[key]
        return {
          ...prev,
          [key]: {
            ...state,
            lockedPage: capturedBugId && (!lockedBugId || capturedBugId === lockedBugId)
              ? capturedPage
              : state?.lockedPage,
            statusText: "正在连接网关..."
          }
        }
      })

      const activeState = activeId
        ? (sessionStates[activeId] || { messages: [], sending: false, statusText: "", model: "default", effort: "medium", permissionMode: "full" })
        : (sessionStates[tempSessionKey] || { messages: [], sending: false, statusText: "", model: "default", effort: "medium", permissionMode: "full" })

      const payload: Record<string, unknown> = {
        workspaceId: params.workspaceId,
        agent: params.agent,
        command: params.command,
        page: pageCapture,
        messages: [userMsg],
        model: activeState.model || "default",
        effort: activeState.effort || "medium",
        permissionMode: activeState.permissionMode || "full"
      }
      if (activeId) {
        payload.sessionId = activeId
      }

      const response = await fetch("http://127.0.0.1:3210/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorMsg = await response.json().catch(() => ({ error: "Unknown gateway error" }))
        throw new Error(errorMsg.error || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith("data: ")) {
            try {
              const chunk = JSON.parse(trimmed.slice(6))
              const currentKey = activeId || tempSessionKey
              if (typeof chunk.seq === "number") {
                lastSeqRef.current[currentKey] = chunk.seq
              }
              if (chunk.type === "done" || chunk.type === "error") {
                gotTerminalEvent = true
              }

              if (chunk.type === "meta" && chunk.sessionId) {
                const sourceKey = activeId || tempSessionKey
                const newId = chunk.sessionId
                activeId = newId
                setSessionId(newId)
                setSessionStates((prev) => {
                  const sourceState = prev[sourceKey] || { messages: [], sending: true, statusText: "", model: "default", effort: "medium", permissionMode: "full" }
                  const next = { ...prev }
                  if (sourceKey === tempSessionKey) {
                    delete next[tempSessionKey]
                  }
                  next[newId] = {
                    messages: sourceState.messages,
                    sending: true,
                    statusText: sourceState.statusText,
                    agent: params.agent,
                    model: sourceState.model,
                    effort: sourceState.effort,
                    permissionMode: sourceState.permissionMode,
                    lockedPage: sourceState.lockedPage,
                    runningTaskId: chunk.taskId || sourceState.runningTaskId
                  }
                  return next
                })
                if (chunk.taskId) {
                  abortControllersRef.current[newId] = controller
                  if (sourceKey !== newId && abortControllersRef.current[sourceKey] === controller) {
                    delete abortControllersRef.current[sourceKey]
                  }
                }
                if (sourceKey === tempSessionKey) {
                  setSessionVersion((v) => v + 1)
                }
              } else if (chunk.type === "status" || chunk.type === "progress") {
                setSessionStates((prev) => ({
                  ...prev,
                  [currentKey]: {
                    ...prev[currentKey],
                    statusText: chunk.content
                  }
                }))
              } else if (chunk.type === "text") {
                assistantMsg.content += chunk.content
                setSessionStates((prev) => {
                  const state = prev[currentKey] || { messages: [], sending: true, statusText: "", agent: undefined, model: "default", effort: "medium", permissionMode: "full" }
                  const nextMessages = [...state.messages]
                  if (!isAssistantMsgAdded) {
                    nextMessages.push(assistantMsg)
                    isAssistantMsgAdded = true
                  } else {
                    nextMessages[nextMessages.length - 1] = { ...assistantMsg }
                  }
                  return {
                    ...prev,
                    [currentKey]: {
                      ...state,
                      messages: nextMessages
                    }
                  }
                })
              } else if (chunk.type === "error") {
                assistantMsg.content += `\n[错误: ${chunk.content}]`
                setSessionStates((prev) => {
                  const state = prev[currentKey] || { messages: [], sending: true, statusText: "", agent: undefined, model: "default", effort: "medium", permissionMode: "full" }
                  const nextMessages = [...state.messages]
                  if (!isAssistantMsgAdded) {
                    nextMessages.push(assistantMsg)
                    isAssistantMsgAdded = true
                  } else {
                    nextMessages[nextMessages.length - 1] = { ...assistantMsg }
                  }
                  return {
                    ...prev,
                    [currentKey]: {
                      ...state,
                      statusText: `错误: ${chunk.content}`,
                      messages: nextMessages
                    }
                  }
                })
              }
            } catch (e) {
              // Ignore partial chunk JSON parse exceptions
            }
          }
        }
      }
    } catch (err: any) {
      // fetch 被 abort 时静默结束，不报错
      if (err.name === "AbortError") {
        const currentKey = activeId || tempSessionKey
        setSessionStates((prev) => {
          const state = prev[currentKey] || { messages: [], sending: false, statusText: "" }
          const nextMessages = [...state.messages]
          if (isAssistantMsgAdded && nextMessages.length > 0) {
            const last = nextMessages[nextMessages.length - 1]
            if (last.role === "assistant" && !last.content) {
              nextMessages[nextMessages.length - 1] = { ...last, content: "[已停止]" }
            }
          }
          return { ...prev, [currentKey]: { ...state, statusText: "", messages: nextMessages } }
        })
      } else {
        console.error(err)
        const currentKey = activeId || tempSessionKey
        setSessionStates((prev) => {
          const state = prev[currentKey] || { messages: [], sending: false, statusText: "" }
          const nextMessages = [...state.messages]
          if (isAssistantMsgAdded) {
            const lastMsg = nextMessages[nextMessages.length - 1]
            nextMessages[nextMessages.length - 1] = {
              ...lastMsg,
              content: lastMsg.content
                ? `${lastMsg.content}\n[发送请求失败: ${err.message}]`
                : `发送请求失败: ${err.message}`
            }
          } else {
            nextMessages.push({ role: "assistant", content: `发送请求失败: ${err.message}` })
          }
          return {
            ...prev,
            [currentKey]: {
              ...state,
              statusText: `连接错误: ${err.message}`,
              messages: nextMessages
            }
          }
        })
      }
    } finally {
      if (abortControllersRef.current[targetKey] === controller) {
        delete abortControllersRef.current[targetKey]
      }
      const currentKey = activeId || tempSessionKey
      if (currentKey !== targetKey && abortControllersRef.current[currentKey] === controller) {
        delete abortControllersRef.current[currentKey]
      }

      const isAborted = controller.signal.aborted
      const currentLatestState = sessionStatesRef.current[currentKey]
      const currentTaskId = currentLatestState?.runningTaskId

      if (!gotTerminalEvent && currentTaskId && !isAborted) {
        setSessionStates((prev) => ({
          ...prev,
          [currentKey]: {
            ...prev[currentKey],
            statusText: "连接断开，正在尝试重连..."
          }
        }))
        setTimeout(() => {
          const curState = sessionStatesRef.current[currentKey]
          if (curState?.runningTaskId === currentTaskId && !controller.signal.aborted) {
            connectTaskStream(currentTaskId, currentKey).catch(console.error)
          }
        }, 1500)
      } else {
        if (gotTerminalEvent || isAborted) {
          setSessionStates((prev) => {
            const state = prev[currentKey] || { messages: [], sending: false, statusText: "" }
            return {
              ...prev,
              [currentKey]: {
                ...state,
                runningTaskId: undefined,
                statusText: isAborted && state.statusText.startsWith("停止失败") ? state.statusText : finalStatusText
              }
            }
          })
        }
      }

      setSessionStates((prev) => ({
        ...prev,
        [currentKey]: {
          ...prev[currentKey],
          sending: false
        }
      }))
      setSessionVersion((v) => v + 1)
    }
  }

  const saveSkill = async (skill: Skill) => {
    try {
      const res = await fetch("http://127.0.0.1:3210/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skill)
      })
      if (res.ok) {
        await loadSkills()
      } else {
        const err = await res.json()
        throw new Error(err.error || "Failed to save skill")
      }
    } catch (err) {
      console.error(err)
      alert("保存技能失败")
    }
  }

  const deleteSkill = async (id: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:3210/api/skills/${id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        await loadSkills()
      } else {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete skill")
      }
    } catch (err) {
      console.error(err)
      alert("删除技能失败")
    }
  }

  // Derive active session state
  const activeState = sessionId
    ? (sessionStates[sessionId] || { messages: [], sending: false, statusText: "", agent: undefined, model: "default", effort: "medium", permissionMode: "full" })
    : (sessionStates[tempSessionKey] || { messages: [], sending: false, statusText: "", agent: undefined, model: "default", effort: "medium", permissionMode: "full" })

  const messages = activeState.messages
  const sending = activeState.sending
  const statusText = activeState.statusText
  const agent = activeState.agent
  const model = activeState.model || "default"
  const effort = activeState.effort || "medium"
  const permissionMode = activeState.permissionMode || "full"

  const stop = useCallback((id?: string, taskId?: string) => {
    const key = id !== undefined ? id : (sessionId || tempSessionKey)
    const runningTaskId = taskId || sessionStatesRef.current[key]?.runningTaskId
    if (runningTaskId) {
      setSessionStates((prev) => {
        const state = prev[key] || { messages: [], sending: true, statusText: "" }
        return {
          ...prev,
          [key]: {
            ...state,
            statusText: "正在停止..."
          }
        }
      })
      stopRunningTask(runningTaskId).catch((err) => {
        console.error("Failed to stop running task:", err)
        abortControllersRef.current[key]?.abort()
        delete abortControllersRef.current[key]
        setSessionStates((prev) => {
          const state = prev[key] || { messages: [], sending: false, statusText: "" }
          return {
            ...prev,
            [key]: {
              ...state,
              sending: false,
              runningTaskId: undefined,
              statusText: `停止失败: ${err.message}`
            }
          }
        })
      })
      return
    }
    abortControllersRef.current[key]?.abort()
    delete abortControllersRef.current[key]
  }, [sessionId, tempSessionKey, stopRunningTask])

  return {
    workspaces,
    skills,
    messages,
    sending,
    statusText,
    agent,
    model,
    effort,
    permissionMode,
    setSessionConfig,
    send,
    stop,
    addWorkspace,
    updateWorkspace,
    deleteWorkspace,
    deleteSession,
    loadWorkspaces,
    saveSkill,
    deleteSkill,
    loadSkills,
    newSession,
    loadSession,
    sessionId,
    sessionVersion,
    sessionStates,
  }
}
