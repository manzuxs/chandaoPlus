import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Skill } from "@chandaoplus/shared"

const BUILTIN_ESTIMATE_PROMPT = [
  "你当前负责评估问题修复工期与修复方案。",
  "请严格按以下 Markdown 结构输出，不要增删一级标题：",
  "## 问题摘要",
  "- 用 1 句话总结问题本质。",
  "",
  "## 影响范围",
  "- 列出涉及的模块、页面、接口、数据或依赖。",
  "",
  "## 工期评估",
  "| 阶段 | 预估耗时 | 说明 |",
  "| --- | --- | --- |",
  "| 排查 |  |  |",
  "| 编码 |  |  |",
  "| 联调 |  |  |",
  "| 测试 |  |  |",
  "",
  "## 风险评估",
  "| 风险项 | 影响程度 | 缓解措施 |",
  "| --- | --- | --- |",
  "|  |  |  |",
  "",
  "## 修复方案",
  "1. 说明具体改动点。",
  "2. 标明涉及文件或模块。",
  "3. 写清每一步如何验证。",
  "",
  "## 验证清单",
  "- 列出自测项。",
  "- 列出需要回归验证的检查项。",
  "",
  "如果信息不足，请在对应项明确写出\"待确认\"及需要补充的信息。"
].join("\n")

function getBuiltinSkills(): Skill[] {
  return [
    {
      id: "estimate",
      name: "评估工期与修复方案",
      icon: "⏱️",
      description: "/estimate",
      keywords: ["estimate", "评估", "工期", "修复", "方案", "pg", "gq", "xf"],
      promptTemplate: BUILTIN_ESTIMATE_PROMPT,
      outputFormat: "markdown",
      builtin: true,
    },
  ]
}

export class SkillStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<Skill[]> {
    const builtin = getBuiltinSkills()
    const custom = await this.loadCustom()
    return [...builtin, ...custom]
  }

  async get(id: string): Promise<Skill | undefined> {
    const skills = await this.list()
    return skills.find((s) => s.id === id)
  }

  async save(skill: Skill): Promise<void> {
    if (skill.builtin) {
      throw new Error("Cannot modify builtin skill")
    }
    const custom = await this.loadCustom()
    const next = [...custom.filter((s) => s.id !== skill.id), { ...skill, builtin: false }]
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8")
  }

  async delete(id: string): Promise<void> {
    const builtin = getBuiltinSkills()
    if (builtin.some((s) => s.id === id)) {
      throw new Error("Cannot delete builtin skill")
    }
    const custom = await this.loadCustom()
    const next = custom.filter((s) => s.id !== id)
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8")
  }

  private async loadCustom(): Promise<Skill[]> {
    try {
      const raw = await readFile(this.filePath, "utf8")
      return JSON.parse(raw) as Skill[]
    } catch {
      return []
    }
  }
}
