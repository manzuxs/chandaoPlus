import React, { useState, useRef, useEffect } from "react"
import type { WorkspaceProfile } from "@chandaoplus/shared"

interface WorkspaceSwitcherProps {
  value: string
  onChange: (value: string) => void
  workspaces: WorkspaceProfile[]
  onAddWorkspace: (profile: WorkspaceProfile) => Promise<void>
}

export function WorkspaceSwitcher({ value, onChange, workspaces, onAddWorkspace }: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [id, setId] = useState("")
  const [label, setLabel] = useState("")
  const [rootPath, setRootPath] = useState("")
  const [defaultAgent, setDefaultAgent] = useState<"claude-code" | "codex">("claude-code")

  const dropdownRef = useRef<HTMLDivElement>(null)

  // 点击外部自动关闭下拉框
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowAddForm(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !label || !rootPath) {
      alert("请填写完整表单")
      return
    }
    try {
      await onAddWorkspace({ id, label, rootPath, defaultAgent })
      setId("")
      setLabel("")
      setRootPath("")
      setShowAddForm(false)
      setIsOpen(false)
    } catch (err: any) {
      alert(`保存失败: ${err.message}`)
    }
  }

  const selectedWorkspace = workspaces.find((ws) => ws.id === value)

  return (
    <div className="custom-workspace-dropdown" ref={dropdownRef}>
      <div 
        className="dropdown-trigger" 
        onClick={() => setIsOpen(!isOpen)} 
        role="button" 
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setIsOpen(!isOpen)
          }
        }}
      >
        <span className="trigger-text">
          {selectedWorkspace ? selectedWorkspace.label : "选择工作空间"}
        </span>
        <span className="trigger-arrow">▼</span>
      </div>

      {isOpen && (
        <div className="dropdown-menu">
          {!showAddForm ? (
            <>
              <div className="dropdown-list">
                {workspaces.length === 0 ? (
                  <div className="dropdown-empty">暂无工作空间</div>
                ) : (
                  workspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className={`dropdown-item ${ws.id === value ? "active" : ""}`}
                      onClick={() => {
                        onChange(ws.id)
                        setIsOpen(false)
                      }}
                      role="option"
                      aria-selected={ws.id === value}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          onChange(ws.id)
                          setIsOpen(false)
                        }
                      }}
                    >
                      <span className="ws-label">{ws.label}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="dropdown-divider" />
              <div
                className="dropdown-action-btn"
                onClick={() => setShowAddForm(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setShowAddForm(true)
                  }
                }}
              >
                ➕ 添加工作空间
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="dropdown-add-form">
              <div className="form-header">
                <h4>添加工作空间</h4>
                <button type="button" className="btn-close-form" onClick={() => setShowAddForm(false)}>
                  返回
                </button>
              </div>
              <div className="form-group">
                <input
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="唯一 ID (如 project-a)"
                  required
                />
              </div>
              <div className="form-group">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="工作空间名称"
                  required
                />
              </div>
              <div className="form-group">
                <input
                  type="text"
                  value={rootPath}
                  onChange={(e) => setRootPath(e.target.value)}
                  placeholder="本地项目绝对路径"
                  required
                />
              </div>

              <button type="submit" className="btn-primary btn-save">保存</button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
