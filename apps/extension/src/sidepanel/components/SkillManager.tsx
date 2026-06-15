import React, { useState } from "react"
import type { Skill } from "@chandaoplus/shared"

// SVG Icons
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

interface SkillManagerProps {
  skills: Skill[]
  onSave: (skill: Skill) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

const EMPTY_SKILL: Skill = {
  id: "",
  name: "",
  icon: "",
  description: "",
  keywords: [],
  promptTemplate: "",
  outputFormat: "markdown",
  builtin: false
}

export function SkillManager({ skills, onSave, onDelete, onClose }: SkillManagerProps) {
  const [draft, setDraft] = useState<Skill>(EMPTY_SKILL)
  const [showForm, setShowForm] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.id || !draft.name || !draft.promptTemplate) {
      return
    }
    await onSave({
      ...draft,
      keywords: draft.keywords.filter(Boolean)
    })
    setDraft(EMPTY_SKILL)
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm("确定要删除这个技能吗？")) {
      await onDelete(id)
    }
  }

  const builtinSkills = skills.filter((s) => s.builtin)
  const customSkills = skills.filter((s) => !s.builtin)

  return (
    <>
      <div className="skill-overlay" onClick={onClose} />
      <div className="skill-card">
        <div className="skill-card-header">
          <div>
            <h3>技能管理</h3>
            <p>维护侧边栏可用技能</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="关闭">
            <XIcon />
          </button>
        </div>

        <div className="skill-card-body">
          {/* Built-in Skills */}
          <div className="skill-list-section">
            <h4>内置技能</h4>
            {builtinSkills.map((skill) => (
              <div key={skill.id} className="skill-list-item">
                <div className="skill-list-item-main">
                  <div className="skill-list-item-icon">{skill.icon}</div>
                  <div>
                    <div className="skill-list-item-name">{skill.name}</div>
                    <div className="skill-list-item-id">/{skill.id}</div>
                  </div>
                </div>
                <span className="skill-list-item-badge">内置</span>
              </div>
            ))}
          </div>

          {/* Custom Skills */}
          <div className="skill-list-section">
            <h4>自定义技能</h4>
            {customSkills.map((skill) => (
              <div key={skill.id} className="skill-list-item">
                <div className="skill-list-item-main">
                  <div className="skill-list-item-icon">{skill.icon}</div>
                  <div>
                    <div className="skill-list-item-name">{skill.name}</div>
                    <div className="skill-list-item-id">/{skill.id}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-icon-sm"
                  onClick={() => handleDelete(skill.id)}
                  aria-label="删除"
                  title="删除"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            {customSkills.length === 0 && (
              <div className="empty-list-text">
                暂无自定义技能
              </div>
            )}
          </div>

          {/* Add Skill */}
          {!showForm && (
            <button type="button" className="btn-add-skill" onClick={() => setShowForm(true)}>
              + 添加自定义技能
            </button>
          )}

          {showForm && (
            <form className="skill-form" onSubmit={handleSubmit}>
              <h4>添加新技能</h4>
              <input
                value={draft.id}
                onChange={(e) => setDraft((prev) => ({ ...prev, id: e.target.value }))}
                placeholder="skill id (唯一标识)"
                required
              />
              <input
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="显示名称"
                required
              />
              <input
                value={draft.icon}
                onChange={(e) => setDraft((prev) => ({ ...prev, icon: e.target.value }))}
                placeholder="图标 (emoji 或字符)"
              />
              <input
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="描述"
              />
              <input
                value={draft.keywords.join(",")}
                onChange={(e) => setDraft((prev) => ({
                  ...prev,
                  keywords: e.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                }))}
                placeholder="关键词，逗号分隔"
              />
              <textarea
                value={draft.promptTemplate}
                onChange={(e) => setDraft((prev) => ({ ...prev, promptTemplate: e.target.value }))}
                placeholder="提示词模板"
                rows={5}
                required
              />
              <div className="skill-form-actions">
                <button type="button" className="btn-pill btn-pill-secondary" onClick={() => setShowForm(false)}>
                  取消
                </button>
                <button type="submit" className="btn-pill btn-pill-primary">
                  保存
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
