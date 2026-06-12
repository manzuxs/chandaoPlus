import React, { useState } from "react"
import type { Skill } from "@chandaoplus/shared"

interface SkillManagerProps {
  skills: Skill[]
  onSave: (skill: Skill) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

const EMPTY_SKILL: Skill = {
  id: "",
  name: "",
  icon: "⚡",
  description: "",
  keywords: [],
  promptTemplate: "",
  outputFormat: "markdown",
  builtin: false
}

export function SkillManager({ skills, onSave, onDelete, onClose }: SkillManagerProps) {
  const [draft, setDraft] = useState<Skill>(EMPTY_SKILL)

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
  }

  return (
    <div className="skill-manager-overlay">
      <div className="skill-manager-card">
        <div className="skill-manager-header">
          <div>
            <h3>技能管理</h3>
            <p>维护侧边栏可用技能</p>
          </div>
          <button type="button" className="btn-close-skill-manager" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="skill-manager-list">
          {skills.map((skill) => (
            <div key={skill.id} className="skill-manager-item">
              <div className="skill-manager-item-main">
                <span className="skill-manager-item-icon">{skill.icon}</span>
                <div>
                  <div className="skill-manager-item-name">{skill.name}</div>
                  <div className="skill-manager-item-id">/{skill.id}</div>
                </div>
              </div>
              {!skill.builtin && (
                <button type="button" className="btn-delete-skill" onClick={() => onDelete(skill.id)}>
                  删除
                </button>
              )}
            </div>
          ))}
        </div>

        <form className="skill-manager-form" onSubmit={handleSubmit}>
          <input
            value={draft.id}
            onChange={(event) => setDraft((prev) => ({ ...prev, id: event.target.value }))}
            placeholder="skill id"
          />
          <input
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="显示名称"
          />
          <input
            value={draft.icon}
            onChange={(event) => setDraft((prev) => ({ ...prev, icon: event.target.value }))}
            placeholder="图标"
          />
          <input
            value={draft.description}
            onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="描述"
          />
          <input
            value={draft.keywords.join(",")}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              keywords: event.target.value.split(",").map((item) => item.trim())
            }))}
            placeholder="关键词，逗号分隔"
          />
          <textarea
            value={draft.promptTemplate}
            onChange={(event) => setDraft((prev) => ({ ...prev, promptTemplate: event.target.value }))}
            placeholder="提示词模板"
            rows={5}
          />
          <button type="submit" className="btn-save-skill">
            保存技能
          </button>
        </form>
      </div>
    </div>
  )
}
