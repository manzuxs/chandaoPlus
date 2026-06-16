import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Skill } from "@chandaoplus/shared"
import { SkillManager } from "./SkillManager"

const builtinSkill: Skill = {
  id: "estimate",
  name: "评估工期与修复方案",
  icon: "clock",
  description: "/estimate",
  keywords: ["estimate", "评估"],
  promptTemplate: "内置评估提示词",
  outputFormat: "markdown",
  builtin: true,
}

const customSkill: Skill = {
  id: "triage",
  name: "问题分诊",
  icon: "bolt",
  description: "快速判断问题归属",
  keywords: ["triage"],
  promptTemplate: "请进行问题分诊",
  outputFormat: "markdown",
  builtin: false,
}

describe("SkillManager", () => {
  it("copies a builtin skill into an editable context-aware custom draft", () => {
    render(<SkillManager skills={[builtinSkill]} onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByLabelText("复制 estimate 为自定义技能"))

    expect(screen.getByText("复制技能")).toBeTruthy()
    expect(screen.getByDisplayValue("estimate-custom")).toBeTruthy()
    expect(screen.getByDisplayValue("评估工期与修复方案（自定义）")).toBeTruthy()
    expect(screen.getByDisplayValue(/page\.md/)).toBeTruthy()
    expect(screen.getByDisplayValue(/conversation\.md/)).toBeTruthy()
  })

  it("edits an existing custom skill and saves the updated draft", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<SkillManager skills={[customSkill]} onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByLabelText("编辑 triage"))
    fireEvent.change(screen.getByPlaceholderText("显示名称"), { target: { value: "问题快速分诊" } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        id: "triage",
        name: "问题快速分诊",
        builtin: false,
      }))
    })
  })
})
