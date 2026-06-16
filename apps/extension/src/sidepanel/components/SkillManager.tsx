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

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
)

interface SkillManagerProps {
  skills: Skill[]
  onSave: (skill: Skill) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

const CONTEXT_AWARE_PROMPT = [
  "你是 chandaoPlus 自定义技能。",
  "请先阅读 {{bundleDir}}/page.md、{{bundleDir}}/metadata.json 和 {{bundleDir}}/conversation.md，必要时结合 {{bundleDir}}/images/ 下的截图。",
  "当前页面标题：{{page.title}}",
  "当前页面 URL：{{page.url}}",
  "",
  "请根据用户请求和页面上下文完成任务，并用 Markdown 输出清晰结论。",
].join("\n")

function createEmptySkill(): Skill {
  return {
    id: "",
    name: "",
    icon: "",
    description: "",
    keywords: [],
    promptTemplate: CONTEXT_AWARE_PROMPT,
    outputFormat: "markdown",
    builtin: false
  }
}

function createCopyId(sourceId: string, skills: Skill[]): string {
  const ids = new Set(skills.map((skill) => skill.id))
  const base = `${sourceId}-custom`
  if (!ids.has(base)) return base

  let index = 2
  while (ids.has(`${base}-${index}`)) {
    index += 1
  }
  return `${base}-${index}`
}

export function SkillManager({ skills, onSave, onDelete, onClose }: SkillManagerProps) {
  const [draft, setDraft] = useState<Skill>(createEmptySkill)
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "copy" | "edit">("create")

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.id || !draft.name || !draft.promptTemplate) {
      return
    }
    await onSave({
      ...draft,
      keywords: draft.keywords.filter(Boolean)
    })
    setDraft(createEmptySkill())
    setShowForm(false)
    setFormMode("create")
  }

  const handleDelete = async (id: string) => {
    if (confirm("确定要删除这个技能吗？")) {
      await onDelete(id)
    }
  }

  const startCreate = () => {
    setDraft(createEmptySkill())
    setFormMode("create")
    setShowForm(true)
  }

  const startEdit = (skill: Skill) => {
    setDraft({ ...skill, builtin: false })
    setFormMode("edit")
    setShowForm(true)
  }

  const startCopy = (skill: Skill) => {
    setDraft({
      ...skill,
      id: createCopyId(skill.id, skills),
      name: `${skill.name}（自定义）`,
      description: skill.description || `复制自 /${skill.id}`,
      promptTemplate: [
        CONTEXT_AWARE_PROMPT,
        "",
        "## 原始技能提示词",
        skill.promptTemplate,
      ].join("\n"),
      builtin: false,
    })
    setFormMode("copy")
    setShowForm(true)
  }

  const cancelForm = () => {
    setDraft(createEmptySkill())
    setFormMode("create")
    setShowForm(false)
  }

  const builtinSkills = skills.filter((s) => s.builtin)
  const customSkills = skills.filter((s) => !s.builtin)
  const formTitle = formMode === "edit" ? "编辑技能" : formMode === "copy" ? "复制技能" : "添加新技能"

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
                <div className="skill-list-item-actions">
                  <span className="skill-list-item-badge">内置</span>
                  <button
                    type="button"
                    className="btn-icon-sm"
                    onClick={() => startCopy(skill)}
                    aria-label={`复制 ${skill.id} 为自定义技能`}
                    title="复制为自定义技能"
                  >
                    <CopyIcon />
                  </button>
                </div>
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
                <div className="skill-list-item-actions">
                  <button
                    type="button"
                    className="btn-icon-sm"
                    onClick={() => startEdit(skill)}
                    aria-label={`编辑 ${skill.id}`}
                    title="编辑"
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    className="btn-icon-sm"
                    onClick={() => handleDelete(skill.id)}
                    aria-label={`删除 ${skill.id}`}
                    title="删除"
                  >
                    <TrashIcon />
                  </button>
                </div>
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
            <button type="button" className="btn-add-skill" onClick={startCreate}>
              + 添加自定义技能
            </button>
          )}

          {showForm && (
            <form className="skill-form" onSubmit={handleSubmit}>
              <h4>{formTitle}</h4>
              <p className="skill-form-hint">
                提示词会作为 <code>&lt;skill_instruction&gt;</code> 注入 Agent。可使用变量：
                <code>{"{{page.title}}"}</code>
                <code>{"{{page.url}}"}</code>
                <code>{"{{bundleDir}}"}</code>
              </p>
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
                rows={8}
                required
              />
              <select
                value={draft.outputFormat}
                onChange={(e) => setDraft((prev) => ({ ...prev, outputFormat: e.target.value as Skill["outputFormat"] }))}
                aria-label="输出格式"
              >
                <option value="markdown">Markdown</option>
                <option value="text">纯文本</option>
                <option value="json">JSON</option>
              </select>
              <div className="skill-form-actions">
                <button type="button" className="btn-pill btn-pill-secondary" onClick={cancelForm}>
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
