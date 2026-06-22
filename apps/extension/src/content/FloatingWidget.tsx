import React, { useState, useEffect, useRef, useCallback } from "react"
import type { Skill } from "@chandaoplus/shared"
import { collectZentaoBugLinks, collectZentaoBugListStatus } from "../recipes/zendao-list"
import { getSettings } from "../lib/shared-settings"

const BugIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 116 0v1" />
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z" />
    <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M6 17l-4 1M17.47 9c1.93-.2 3.53-1.9 3.53-4M18 13h4M18 17l4 1" />
  </svg>
)

const MinimizeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
)

export function FloatingWidget() {
  const [collapsed, setCollapsed] = useState(true)
  const [skills, setSkills] = useState<Skill[]>([])
  const [command, setCommand] = useState<string>("default") // 选中的技能 ID
  const [checkedCount, setCheckedCount] = useState(0)

  // 工作空间列表与状态
  const [workspaces, setWorkspaces] = useState<{ id: string; label: string }[]>([])
  const [workspaceId, setWorkspaceId] = useState("")

  // 表单配置状态
  const [agentId, setAgentId] = useState<"claude-code" | "codex" | "opencode">("claude-code")
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [selectedModel, setSelectedModel] = useState<string>("default")
  const [selectedEffort, setSelectedEffort] = useState<string>("medium")
  const [selectedPermission, setSelectedPermission] = useState<string>("full")
  const [description, setDescription] = useState("")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // 1. 加载技能列表与工作空间列表
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return

    chrome.runtime.sendMessage({ type: "FLOATING_GET_SKILLS" }, (res: any) => {
      if (Array.isArray(res)) setSkills(res)
    })

    chrome.runtime.sendMessage({ type: "FLOATING_GET_WORKSPACES" }, (res: any) => {
      if (Array.isArray(res) && res.length > 0) {
        setWorkspaces(res)
        getSettings().then((s) => {
          const id = s.lastWorkspaceId || res[0].id
          setWorkspaceId(id)
          const savedAgent = s.lastAgent || "claude-code"
          setAgentId(savedAgent)
          const agentCfg = s.agentSettings[savedAgent] || {}
          setSelectedModel(agentCfg.model || "default")
          setSelectedEffort(agentCfg.effort || "medium")
          setSelectedPermission(agentCfg.permissionMode || "full")
        })
      }
    })
  }, [])

  // 2. 当 agentId 发生变化时，动态获取其模型列表
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime) return
    setModels([])
    fetch(`http://127.0.0.1:3210/api/chat/models?agent=${agentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setModels(data)
          const exists = data.some(m => m.id === selectedModel)
          if (!exists) setSelectedModel("default")
        } else {
          setModels([{ id: "default", name: "默认模型" }])
          setSelectedModel("default")
        }
      })
      .catch(() => {
        setModels([{ id: "default", name: "默认模型" }])
        setSelectedModel("default")
      })
  }, [agentId])

  // 3. 轮询页面勾选状态
  useEffect(() => {
    const poll = () => {
      const { items, isAnyChecked } = collectZentaoBugListStatus({
        url: window.location.href,
        html: document.documentElement.outerHTML,
        baseUrl: window.location.href,
        liveDocument: document
      })
      setCheckedCount(isAnyChecked ? items.length : 0)
    }
    poll()
    const timer = window.setInterval(poll, 1000)
    return () => window.clearInterval(timer)
  }, [])

  // 4. 处理工作空间切换并同步到 storage 以触发侧边栏联动
  const handleWorkspaceChange = (id: string) => {
    setWorkspaceId(id)
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ lastWorkspaceId: id })
    }
  }

  // 5. 提交任务
  const handleSubmit = useCallback(async () => {
    console.log("[chandaoPlus TaskCreator] handleSubmit clicked. workspaceId:", workspaceId, "command:", command)
    if (isSubmitting || !workspaceId) {
      console.warn("[chandaoPlus TaskCreator] Cancelled submit: isSubmitting =", isSubmitting, "workspaceId =", workspaceId)
      return
    }
    if (command === "default") {
      alert("请先选择一项技能！")
      return
    }

    setIsSubmitting(true)
    try {
      console.log("[chandaoPlus TaskCreator] Extracting selected bugs from DOM...")
      const { items } = collectZentaoBugListStatus({
        url: window.location.href,
        html: document.documentElement.outerHTML,
        baseUrl: window.location.href,
        liveDocument: document
      })

      console.log("[chandaoPlus TaskCreator] Extracted items to process:", items)

      if (items.length === 0) {
        alert("未检测到有效的 Bug 链接！")
        setIsSubmitting(false)
        return
      }

      const payload = {
        type: "TRIGGER_BATCH_SKILL",
        items,
        command: command, // 选中的技能 ID
        options: {
          agent: agentId,
          model: selectedModel,
          effort: selectedEffort,
          permissionMode: selectedPermission,
          description: description
        }
      }

      console.log("[chandaoPlus TaskCreator] Sending TRIGGER_BATCH_SKILL message to runtime...", payload)

      // 通过 runtime 消息向侧边栏派发 TRIGGER_BATCH_SKILL，携带用户选中的工作空间
      chrome.runtime.sendMessage(payload, (response) => {
        console.log("[chandaoPlus TaskCreator] Runtime message response received:", response)
        if (chrome.runtime.lastError) {
          console.error("[chandaoPlus TaskCreator] Runtime sendMessage Error:", chrome.runtime.lastError.message)
        }
      })

      // 显示成功状态并自动折叠
      setSubmitSuccess(true)
      setTimeout(() => {
        setSubmitSuccess(false)
        setCollapsed(true)
        setDescription("") // 清空输入
      }, 1500)

    } catch (err: any) {
      console.error("[chandaoPlus TaskCreator] handleSubmit error:", err)
      alert(`添加任务失败: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }, [workspaceId, command, agentId, selectedModel, selectedEffort, selectedPermission, description, isSubmitting])

  if (collapsed) {
    return (
      <button className="floating-toggle" onClick={() => setCollapsed(false)} title="打开 chandaoPlus 任务添加器">
        <BugIcon />
        {checkedCount > 0 && <span className="badge">{checkedCount}</span>}
      </button>
    )
  }

  return (
    <div className="floating-widget">
      {/* Header */}
      <div className="fw-header">
        <div className="fw-header-left">
          <BugIcon />
          <span>chandaoPlus 任务添加器</span>
        </div>
        <div className="fw-header-right">
          <button className="fw-header-btn" onClick={() => setCollapsed(true)} title="最小化">
            <MinimizeIcon />
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className={`fw-status-bar ${checkedCount > 0 ? "has-checked" : ""}`}>
        <span className="dot" />
        <span>
          {checkedCount > 0 ? `已勾选 ${checkedCount} 个 Bug` : "未勾选 Bug（发送时取列表前 20 个）"}
        </span>
      </div>

      {/* Form Content */}
      <div className="fw-form-body">
        {submitSuccess ? (
          <div className="fw-success-screen">
            <div className="success-icon">✓</div>
            <h4>任务添加成功</h4>
            <p>已派发至侧边栏队列中执行</p>
          </div>
        ) : (
          <>
            {/* Grid options */}
            <div className="fw-form-grid">
              <div className="fw-field" style={{ gridColumn: "span 2" }}>
                <label>工作空间</label>
                <select value={workspaceId} onChange={(e) => handleWorkspaceChange(e.target.value)}>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>{w.label}</option>
                  ))}
                </select>
              </div>

              <div className="fw-field">
                <label>执行渠道</label>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value as any)}>
                  <option value="claude-code">Claude Code</option>
                  <option value="codex">Codex</option>
                  <option value="opencode">OpenCode</option>
                </select>
              </div>

              <div className="fw-field">
                <label>大语言模型</label>
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                  <option value="default">默认模型</option>
                  {models.filter(m => m.id !== "default").map((m) => (
                    <option key={m.id} value={m.id}>{m.name.split("/").pop()}</option>
                  ))}
                </select>
              </div>

              <div className="fw-field">
                <label>权限模式</label>
                <select value={selectedPermission} onChange={(e) => setSelectedPermission(e.target.value)}>
                  <option value="full">完全访问</option>
                  <option value="semi">半自动 (询问)</option>
                </select>
              </div>

              <div className="fw-field">
                <label>推理级别</label>
                <select value={selectedEffort} onChange={(e) => setSelectedEffort(e.target.value)}>
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </div>
            </div>

            {/* Skills selection */}
            <div className="fw-skills-section">
              <label className="section-label">选择评估技能 (必选)</label>
              <div className="fw-skills-list">
                {skills.map((skill) => {
                  const isSelected = command === skill.id
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      className={`fw-skill-item ${isSelected ? "selected" : ""}`}
                      onClick={() => setCommand(isSelected ? "default" : skill.id)}
                    >
                      ⚡ {skill.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Task Description */}
            <div className="fw-desc-section">
              <label className="section-label">任务描述与特别指令 (可选)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="在此输入需要 Agent 额外注意的附加描述信息..."
                rows={3}
              />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {!submitSuccess && (
        <div className="fw-footer-action">
          <button
            type="button"
            className="fw-submit-btn"
            disabled={isSubmitting || command === "default" || !workspaceId}
            onClick={handleSubmit}
          >
            {isSubmitting ? "正在派发任务中..." : "确认添加任务并执行"}
          </button>
        </div>
      )}
    </div>
  )
}
