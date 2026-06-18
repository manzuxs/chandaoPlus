import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Skill } from "@chandaoplus/shared"

const BUILTIN_ESTIMATE_PROMPT = [
  "你当前负责评估问题修复工期与修复方案。",
  "请优先阅读工作空间的相关文件获取最新上下文，切忌凭空猜测。",
  "请严格按以下 Markdown 结构输出，不要增删一级标题：",
  "## 问题摘要",
  "- 用 1 句话总结问题本质。",
  "",
  "## 根因分析",
  "- 说明导致问题发生的直接原因与底层根本原因（如代码层逻辑缺陷、边界处理不全、数据流断裂等）。",
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
  "## 注意事项",
  "- 列出本次修复需注意的代码规范（例如国际化、命名规范、工程分层等）。",
  "- 说明工作空间必读文件（如 <must_read_files> 中的规则）对本次修复方案的具体约束和要求。",
  "- 说明是否存在需要向后兼容或特殊处理的设计约束。",
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
  "- 【重要】必须主动查看并遵循项目及 <must_read_files> 中配置的代码风格与规范约束，不可编写违背规范的代码。",
  "- 【硬性纪律】代码修改完成后，你必须运行项目编译命令（如 build）或执行相关的单元测试来验证修改，并将验证的指令和结果写在“验证结果”中。",
  "- 优先使用现有项目风格、组件、工具函数和国际化方案。",
  "- 贯彻防御性编程，对入参、状态和潜在的空值/异常进行安全处理。",
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
  "你当前负责检查修复成果是否满足禅道问题诉求，并评估回归风险与规范遵循度。",
  "请优先阅读 {{bundleDir}}/page.md、{{bundleDir}}/metadata.json、{{bundleDir}}/conversation.md；如有截图，请结合 {{bundleDir}}/images/ 分析验收标准。",
  "工作原则：",
  "- 以禅道的重现步骤、结果、期望和评论为验收依据。",
  "- 【重要】对照 <must_read_files> 等规范，核查修改方案是否符合项目的工程与质量规范。若严重违反规范，直接判定为不通过。",
  "- 【硬性纪律】必须在终端实际运行一次测试、类型检查或构建指令来校验改动，并在“验证记录”中写明，不允许纯静态看代码通过。",
  "- 优先检查当前代码改动、相关实现、测试覆盖和潜在回归点。",
  "- 默认不做大范围修改；如发现明显漏修或错误，可给出最小修正建议。",
  "",
  "请严格按以下 Markdown 结构输出，不要增删一级标题：",
  "## 验收结论",
  "- 明确写出：通过 / 不通过 / 需补充验证，并给出一句话理由。",
  "",
  "## 对照检查表",
  "| 检查维度 | 检查结果 | 说明 (说明本次修复的表现与影响) |",
  "| --- | --- | --- |",
  "| 解决禅道诉求 |  | 是否符合禅道描述与验收点 |",
  "| 项目规范遵循 |  | 是否完全符合必读指南与代码质量规范 |",
  "| 构建与编译通过 |  | 实际运行构建编译命令是否无报错通过 |",
  "",
  "## 代码检查",
  "- 说明检查过的文件、关键逻辑和是否存在漏改或规范遗漏。",
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
      icon: "clock",
      description: "/estimate",
      keywords: ["estimate", "评估", "工期", "修复", "方案", "pg", "gq", "xf"],
      promptTemplate: BUILTIN_ESTIMATE_PROMPT,
      outputFormat: "markdown",
      builtin: true,
    },
    {
      id: "fix",
      name: "定位并修复问题",
      icon: "gear",
      description: "/fix",
      keywords: ["fix", "repair", "修复", "定位", "根因", "改代码", "xf", "dw"],
      promptTemplate: BUILTIN_FIX_PROMPT,
      outputFormat: "markdown",
      builtin: true,
    },
    {
      id: "verify",
      name: "修复验收检查",
      icon: "check",
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
