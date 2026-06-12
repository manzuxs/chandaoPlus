import { useState, useEffect, useCallback } from "react"
import type { WorkspaceProfile, ChatMessage, ChatCommand, Skill } from "@chandaoplus/shared"
import { captureActiveTabPage } from "../../lib/page-capture"

export function useChatSession() {
  const [workspaces, setWorkspaces] = useState<WorkspaceProfile[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [statusText, setStatusText] = useState("")

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

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      const handleProgressMessage = (message: any) => {
        if (message.type === "CAPTURE_PROGRESS") {
          setStatusText(message.content)
        }
      }
      chrome.runtime.onMessage.addListener(handleProgressMessage)
      return () => {
        chrome.runtime.onMessage.removeListener(handleProgressMessage)
      }
    }
  }, [])

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

  const send = async (params: {
    workspaceId: string
    agent: "claude-code" | "codex"
    command: ChatCommand
    input: string
  }) => {
    if (sending) return
    setSending(true)
    setStatusText("正在捕获页面内容...")

    // Clear previous stream messages and set up user message
    const userMsg: ChatMessage = { role: "user", content: params.input || `执行命令: ${params.command}` }
    setMessages((prev) => [...prev, userMsg])

    try {
      setStatusText("正在提取当前网页...")
      const pageCapture = await captureActiveTabPage()

      setStatusText("正在连接网关...")
      const payload = {
        workspaceId: params.workspaceId,
        agent: params.agent,
        command: params.command,
        page: pageCapture,
        messages: [userMsg]
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
      let assistantMsg: ChatMessage = { role: "assistant", content: "" }

      // Append empty assistant message for streaming
      setMessages((prev) => [...prev, assistantMsg])

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
              if (chunk.type === "status" || chunk.type === "progress") {
                setStatusText(chunk.content)
              } else if (chunk.type === "text") {
                assistantMsg.content += chunk.content
                setMessages((prev) => {
                  const next = [...prev]
                  next[next.length - 1] = { ...assistantMsg }
                  return next
                })
              } else if (chunk.type === "error") {
                setStatusText(`错误: ${chunk.content}`)
                assistantMsg.content += `\n[错误: ${chunk.content}]`
                setMessages((prev) => {
                  const next = [...prev]
                  next[next.length - 1] = { ...assistantMsg }
                  return next
                })
              }
            } catch (e) {
              // Ignore parse error on partial SSE chunks
            }
          }
        }
      }
      setStatusText("")
    } catch (err: any) {
      console.error(err)
      setStatusText(`连接错误: ${err.message}`)
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `发送请求失败: ${err.message}` }
      ])
    } finally {
      setSending(false)
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

  return {
    workspaces,
    skills,
    messages,
    sending,
    statusText,
    send,
    addWorkspace,
    loadWorkspaces,
    saveSkill,
    deleteSkill,
    loadSkills
  }
}
