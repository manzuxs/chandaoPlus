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

const BUILTIN_FIX_PROMPT = [
  "你当前负责结合禅道问题上下文与代码实现定位根因，并执行最小、安全、可验证的修复。",
  "请优先阅读 {{bundleDir}}/page.md、{{bundleDir}}/metadata.json、{{bundleDir}}/conversation.md；如有截图，请结合 {{bundleDir}}/images/ 分析界面表现。",
  "工作原则：",
  "- 先定位根因，再修改代码；不要做无关重构。",
  "- 优先使用现有项目风格、组件、工具函数和国际化方案。",
  "- 保护用户已有改动，不覆盖无关文件。",
  "- 能直接修复时请落地代码改动；信息不足或风险较高时，明确列出阻塞点和建议方案。",
  "",
  "请严格按以下 Markdown 结构输出，不要增删一级标题：",
  "## 根因定位",
  "- 说明问题发生的直接原因和代码层原因。",
  "",
  "## 修复内容",
  "- 列出实际修改或建议修改的文件、模块和关键逻辑。",
  "",
  "## 影响范围",
  "- 说明可能影响的页面、接口、状态、国际化、权限或数据流。",
  "",
  "## 验证结果",
  "- 说明已执行的自测、单测、类型检查或无法执行的原因。",
  "",
  "## 风险与后续",
  "- 列出遗留风险、需要产品/测试确认的点，以及建议的回归范围。"
].join("\n")

const BUILTIN_VERIFY_PROMPT = [
  "你当前负责检查修复成果是否满足禅道问题诉求，并评估回归风险。",
  "请优先阅读 {{bundleDir}}/page.md、{{bundleDir}}/metadata.json、{{bundleDir}}/conversation.md；如有截图，请结合 {{bundleDir}}/images/ 分析验收标准。",
  "工作原则：",
  "- 以禅道的重现步骤、结果、期望和评论为验收依据。",
  "- 优先检查当前代码改动、相关实现、测试覆盖和潜在回归点。",
  "- 默认不做大范围修改；如发现明显漏修或错误，可给出最小修正建议。",
  "- 验证命令必须说明是否已执行及结果。",
  "",
  "请严格按以下 Markdown 结构输出，不要增删一级标题：",
  "## 验收结论",
  "- 明确写出：通过 / 不通过 / 需补充验证，并给出一句话理由。",
  "",
  "## 对照禅道诉求",
  "| 验收点 | 检查结果 | 说明 |",
  "| --- | --- | --- |",
  "|  |  |  |",
  "",
  "## 代码检查",
  "- 说明检查过的文件、关键逻辑和是否存在漏改。",
  "",
  "## 验证记录",
  "- 列出执行过的命令、测试、自测路径和结果；无法执行时说明原因。",
  "",
  "## 回归风险",
  "- 列出需要重点回归的场景、边界条件和建议补充测试。"
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
    {
      id: "fix",
      name: "定位并修复问题",
      icon: "🛠️",
      description: "/fix",
      keywords: ["fix", "repair", "修复", "定位", "根因", "改代码", "xf", "dw"],
      promptTemplate: BUILTIN_FIX_PROMPT,
      outputFormat: "markdown",
      builtin: true,
    },
    {
      id: "verify",
      name: "修复验收检查",
      icon: "✅",
      description: "/verify",
      keywords: ["verify", "check", "验收", "检查", "回归", "测试", "jc", "ys"],
      promptTemplate: BUILTIN_VERIFY_PROMPT,
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
