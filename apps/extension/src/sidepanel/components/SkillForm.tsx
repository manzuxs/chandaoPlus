import React, { useState } from "react"
import type { Skill } from "@chandaoplus/shared"

interface SkillFormProps {
  skill?: Skill | null
  onSave: (skill: Skill) => Promise<void>
  onCancel: () => void
}

const DEFAULT_SKILL: Skill = {
  id: "",
  name: "",
  icon: "⚡",
  description: "",
  keywords: [],
  promptTemplate: "",
  outputFormat: "markdown",
  builtin: false,
}

export function SkillForm({ skill, onSave, onCancel }: SkillFormProps) {
  const [form, setForm] = useState<Skill>(skill || { ...DEFAULT_SKILL })
  const [keywordsInput, setKeywordsInput] = useState(skill?.keywords.join(", ") || "")
  const [saving, setSaving] = useState(false)

  const handleChange = (field: keyof Skill, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.id || !form.name || !form.promptTemplate) {
      alert("请填写必填字段：ID、名称、提示词模板")
      return
    }

    const keywords = keywordsInput
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)

    setSaving(true)
    try {
      await onSave({ ...form, keywords })
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="skill-form" onSubmit={handleSubmit}>
      <h4>{skill ? "编辑技能" : "添加新技能"}</h4>

      <div className="form-group">
        <label htmlFor="skill-id">
          ID <span className="required">*</span>
        </label>
        <input
          id="skill-id"
          type="text"
          value={form.id}
          onChange={(e) => handleChange("id", e.target.value)}
          placeholder="例如: review-code"
          disabled={!!skill}
          required
        />
        <small>唯一标识符，创建后不可修改</small>
      </div>

      <div className="form-group">
        <label htmlFor="skill-name">
          名称 <span className="required">*</span>
        </label>
        <input
          id="skill-name"
          type="text"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="例如: 代码审查"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="skill-icon">图标</label>
        <input
          id="skill-icon"
          type="text"
          value={form.icon}
          onChange={(e) => handleChange("icon", e.target.value)}
          placeholder="⚡"
        />
      </div>

      <div className="form-group">
        <label htmlFor="skill-description">描述</label>
        <input
          id="skill-description"
          type="text"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="技能描述"
        />
      </div>

      <div className="form-group">
        <label htmlFor="skill-keywords">关键词</label>
        <input
          id="skill-keywords"
          type="text"
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder="用逗号分隔，例如: review, 审查, 代码"
        />
        <small>用于搜索匹配，逗号分隔</small>
      </div>

      <div className="form-group">
        <label htmlFor="skill-prompt">
          提示词模板 <span className="required">*</span>
        </label>
        <textarea
          id="skill-prompt"
          value={form.promptTemplate}
          onChange={(e) => handleChange("promptTemplate", e.target.value)}
          placeholder="支持变量: {{page.title}}, {{page.url}}, {{bundleDir}}"
          rows={10}
          required
        />
        <small>AI 执行此技能时使用的提示词</small>
      </div>

      <div className="form-group">
        <label htmlFor="skill-output">输出格式</label>
        <select
          id="skill-output"
          value={form.outputFormat}
          onChange={(e) => handleChange("outputFormat", e.target.value)}
        >
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
          <option value="text">纯文本</option>
        </select>
      </div>

      <div className="form-actions">
        <button type="button" className="btn-cancel" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn-save" disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  )
}
