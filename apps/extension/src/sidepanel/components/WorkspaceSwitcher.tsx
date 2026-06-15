import React, { useState } from "react"
import type { WorkspaceProfile } from "@chandaoplus/shared"

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
)

interface WorkspaceSwitcherProps {
  value: string
  onChange: (value: string) => void
  workspaces: WorkspaceProfile[]
  onAddWorkspace: (profile: WorkspaceProfile) => Promise<void>
  onUpdateWorkspace: (profile: WorkspaceProfile) => Promise<void>
  onDeleteWorkspace: (id: string) => Promise<void>
}

export function WorkspaceSwitcher({ value, onChange, workspaces, onAddWorkspace, onUpdateWorkspace, onDeleteWorkspace }: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<WorkspaceProfile | null>(null)
  const [id, setId] = useState("")
  const [label, setLabel] = useState("")
  const [rootPath, setRootPath] = useState("")

  const selectedWorkspace = workspaces.find((ws) => ws.id === value)

  const resetForm = () => {
    setId("")
    setLabel("")
    setRootPath("")
    setEditing(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !label || !rootPath) {
      alert("请填写完整表单")
      return
    }
    try {
      if (editing) {
        await onUpdateWorkspace({ id, label, rootPath, defaultAgent: editing.defaultAgent })
      } else {
        await onAddWorkspace({ id, label, rootPath, defaultAgent: "claude-code" })
      }
      resetForm()
      setIsOpen(false)
    } catch (err: any) {
      alert(`保存失败: ${err.message}`)
    }
  }

  const handleSelect = (wsId: string) => {
    onChange(wsId)
    setIsOpen(false)
    resetForm()
  }

  const handleEdit = (ws: WorkspaceProfile) => {
    setEditing(ws)
    setId(ws.id)
    setLabel(ws.label)
    setRootPath(ws.rootPath)
    setShowForm(true)
  }

  const handleDelete = async (wsId: string) => {
    if (confirm("确定要删除这个工作空间吗？")) {
      await onDeleteWorkspace(wsId)
      if (wsId === value) {
        onChange("")
      }
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-pill btn-pill-secondary"
        onClick={() => setIsOpen(true)}
        title={selectedWorkspace ? selectedWorkspace.label : "选择工作空间"}
      >
        <span className="btn-label">
          {selectedWorkspace ? selectedWorkspace.label : "选择工作空间"}
        </span>
      </button>

      {isOpen && (
        <>
          <div className="skill-overlay" onClick={() => { setIsOpen(false); resetForm() }} />
          <div className="skill-card">
            <div className="skill-card-header">
              <div>
                <h3>工作空间</h3>
                <p>选择、编辑或添加工作空间</p>
              </div>
              <button type="button" className="btn-icon" onClick={() => { setIsOpen(false); resetForm() }} aria-label="关闭">
                <XIcon />
              </button>
            </div>

            <div className="skill-card-body">
              {!showForm ? (
                <>
                  <div className="skill-list-section">
                    <h4>已有工作空间</h4>
                    {workspaces.length === 0 ? (
                      <div className="empty-list-text">
                        暂无工作空间
                      </div>
                    ) : (
                      workspaces.map((ws) => (
                        <div
                          key={ws.id}
                          className={`skill-list-item ${ws.id === value ? "active" : ""}`}
                        >
                          <div className="skill-list-item-main" onClick={() => handleSelect(ws.id)}>
                            <div className="skill-list-item-icon">{ws.label.charAt(0).toUpperCase()}</div>
                            <div>
                              <div className="skill-list-item-name">{ws.label}</div>
                              <div className="skill-list-item-id">{ws.id}</div>
                            </div>
                          </div>
                          <div className="skill-list-item-actions">
                            {ws.id === value && (
                              <span className="skill-list-item-badge">当前</span>
                            )}
                            <button
                              type="button"
                              className="btn-icon-sm"
                              onClick={() => handleEdit(ws)}
                              aria-label="编辑"
                              title="编辑"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="btn-icon-sm"
                              onClick={() => handleDelete(ws.id)}
                              aria-label="删除"
                              title="删除"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <button type="button" className="btn-add-skill" onClick={() => { resetForm(); setShowForm(true) }}>
                    + 添加工作空间
                  </button>
                </>
              ) : (
                <form className="skill-form" onSubmit={handleSubmit}>
                  <h4>{editing ? "编辑工作空间" : "添加工作空间"}</h4>
                  <input
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="唯一 ID (如 project-a)"
                    disabled={!!editing}
                    required
                  />
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="工作空间名称"
                    required
                  />
                  <input
                    type="text"
                    value={rootPath}
                    onChange={(e) => setRootPath(e.target.value)}
                    placeholder="本地项目绝对路径"
                    required
                  />
                  <div className="skill-form-actions">
                    <button type="button" className="btn-pill btn-pill-secondary" onClick={() => resetForm()}>
                      取消
                    </button>
                    <button type="submit" className="btn-pill btn-pill-primary">
                      {editing ? "更新" : "保存"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
