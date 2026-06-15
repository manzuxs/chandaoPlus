import { useState, useEffect, useCallback } from "react"
import type { WorkspaceProfile, ChatMessage, ChatCommand, Skill } from "@chandaoplus/shared"
import { captureActiveTabPage } from "../../lib/page-capture"

export function useChatSession(workspaceId: string) {
  const [workspaces, setWorkspaces] = useState<WorkspaceProfile[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [sessionStates, setSessionStates] = useState<Record<string, {
    messages: ChatMessage[]
    sending: boolean
    statusText: string
  }>>({})
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionVersion, setSessionVersion] = useState(0)

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
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(`session_${workspaceId}`).then((result: Record<string, any>) => {
        const stored = result[`session_${workspaceId}`]
        if (stored) {
          setSessionId(stored)
          fetch(`http://127.0.0.1:3210/api/sessions/${stored}`)
            .then((r) => r.json())
            .then((session) => {
              if (session.messages) {
                setSessionStates((prev) => ({
                  ...prev,
                  [stored]: {
                    messages: session.messages,
                    sending: prev[stored]?.sending || false,
                    statusText: prev[stored]?.statusText || ""
                  }
                }))
              }
            })
            .catch(() => {})
        } else {
          setSessionId(null)
        }
      })
    }
  }, [workspaceId])

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
          const currentActiveId = sessionId || "temp"
          setSessionStates((prev) => ({
            ...prev,
            [currentActiveId]: {
              messages: prev[currentActiveId]?.messages || [],
              sending: prev[currentActiveId]?.sending || false,
              statusText: message.content
            }
          }))
        }
      }
      chrome.runtime.onMessage.addListener(handleProgressMessage)
      return () => {
        chrome.runtime.onMessage.removeListener(handleProgressMessage)
      }
    }
  }, [sessionId])

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

  const deleteSession = useCallback(async (id: string) => {
    try {
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
  }, [sessionId, workspaceId])

  const newSession = useCallback(() => {
    setSessionId(null)
    setSessionStates((prev) => {
      const next = { ...prev }
      delete next.temp
      return next
    })
  }, [])

  const loadSession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:3210/api/sessions/${id}`)
      if (!res.ok) return
      const session = await res.json()
      if (session.messages) {
        setSessionId(id)
        setSessionStates((prev) => ({
          ...prev,
          [id]: {
            messages: session.messages,
            sending: prev[id]?.sending || false,
            statusText: prev[id]?.statusText || ""
          }
        }))
      }
    } catch (err) {
      console.error("Failed to load session:", err)
    }
  }, [])

  const send = async (params: {
    workspaceId: string
    agent: "claude-code" | "codex"
    command: ChatCommand
    input: string
  }) => {
    let activeId = sessionId
    const targetKey = activeId || "temp"
    
    // Check if currently sending for this specific targetKey
    if (sessionStates[targetKey]?.sending) return

    const userMsg: ChatMessage = { role: "user", content: params.input || `执行命令: ${params.command}` }
    
    setSessionStates((prev) => {
      const state = prev[targetKey] || { messages: [], sending: false, statusText: "" }
      return {
        ...prev,
        [targetKey]: {
          messages: [...state.messages, userMsg],
          sending: true,
          statusText: "正在捕获页面内容..."
        }
      }
    })

    let isAssistantMsgAdded = false
    let assistantMsg: ChatMessage = { role: "assistant", content: "" }

    try {
      // Step 1: Capture page
      const pageCapture = await captureActiveTabPage()

      setSessionStates((prev) => {
        const key = activeId || "temp"
        return {
          ...prev,
          [key]: {
            ...prev[key],
            statusText: "正在连接网关..."
          }
        }
      })

      const payload: Record<string, unknown> = {
        workspaceId: params.workspaceId,
        agent: params.agent,
        command: params.command,
        page: pageCapture,
        messages: [userMsg]
      }
      if (activeId) {
        payload.sessionId = activeId
      }

      const response = await fetch("http://127.0.0.1:3210/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
              if (chunk.type === "meta" && chunk.sessionId) {
                const newId = chunk.sessionId
                activeId = newId
                setSessionId(newId)
                setSessionStates((prev) => {
                  const tempState = prev.temp || { messages: [], sending: true, statusText: "" }
                  const next = { ...prev }
                  delete next.temp
                  next[newId] = {
                    messages: tempState.messages,
                    sending: true,
                    statusText: tempState.statusText
                  }
                  return next
                })
              } else if (chunk.type === "status" || chunk.type === "progress") {
                const currentKey = activeId || "temp"
                setSessionStates((prev) => ({
                  ...prev,
                  [currentKey]: {
                    ...prev[currentKey],
                    statusText: chunk.content
                  }
                }))
              } else if (chunk.type === "text") {
                assistantMsg.content += chunk.content
                const currentKey = activeId || "temp"
                setSessionStates((prev) => {
                  const state = prev[currentKey] || { messages: [], sending: true, statusText: "" }
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
                const currentKey = activeId || "temp"
                assistantMsg.content += `\n[错误: ${chunk.content}]`
                setSessionStates((prev) => {
                  const state = prev[currentKey] || { messages: [], sending: true, statusText: "" }
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

      const currentKey = activeId || "temp"
      setSessionStates((prev) => ({
        ...prev,
        [currentKey]: {
          ...prev[currentKey],
          statusText: ""
        }
      }))
    } catch (err: any) {
      console.error(err)
      const currentKey = activeId || "temp"
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
    } finally {
      const currentKey = activeId || "temp"
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
    ? (sessionStates[sessionId] || { messages: [], sending: false, statusText: "" })
    : (sessionStates["temp"] || { messages: [], sending: false, statusText: "" })

  const messages = activeState.messages
  const sending = activeState.sending
  const statusText = activeState.statusText

  return {
    workspaces,
    skills,
    messages,
    sending,
    statusText,
    send,
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
  }
}
