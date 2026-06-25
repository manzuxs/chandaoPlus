import { stat, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ChatMessage, ChatRequest, ChatStreamChunk, PageCapture, Skill, WorkspaceProfile } from "@chandaoplus/shared"
import { escapeXml, formatPageCaptureToXml } from "@chandaoplus/shared"

export interface AgentRunOptions {
  request: ChatRequest
  workspace: WorkspaceProfile
  bundleDir: string
  skill?: Skill
  onChunk: (chunk: ChatStreamChunk) => void
  sessionStore: any
  signal?: AbortSignal
}

export interface AgentAdapter {
  id: "claude-code" | "codex" | "opencode" | "antigravity" | "qcode"
  run(options: AgentRunOptions): Promise<void>
}

export async function buildPrompt(params: {
  command: string
  workspaceRoot: string
  bundleDir: string
  messages: ChatMessage[]
  pageTitle?: string
  pageUrl?: string
  skill?: Skill
  page?: PageCapture
  requiredFiles?: string[]
}): Promise<string> {
  const { command, workspaceRoot, bundleDir, messages, pageTitle = "", pageUrl = "", skill, page, requiredFiles } = params

  // 1. Session Context
  const clipboardImages = page?.images?.filter((img: any) => img.isClipboard) || []
  const nonClipboardImages = page?.images?.filter((img: any) => !img.isClipboard) || []
  const hasValidPage = page && page.url !== "http://localhost/empty-page"
  const filteredPage = page ? { ...page, images: nonClipboardImages } : undefined
  const pageContextXml = hasValidPage ? `\n${formatPageCaptureToXml(filteredPage!, bundleDir)}` : ""
  const sessionContext = `<session_context>
  <workspace_root>${workspaceRoot}</workspace_root>
  <bundle_dir>${bundleDir}</bundle_dir>${pageContextXml}
</session_context>`

  // 1.5 Required Files (Must-read Files)
  let requiredFilesXml = ""
  if (requiredFiles && requiredFiles.length > 0) {
    const fileBlocks = await Promise.all(
      requiredFiles.map(async (relPath) => {
        const absPath = join(workspaceRoot, relPath)
        try {
          const stats = await stat(absPath)
          if (stats.isFile()) {
            const content = await readFile(absPath, "utf8")
            return `  <file path="${escapeXml(relPath)}">
<![CDATA[${content}]]>
  </file>`
          } else {
            return `  <file>${escapeXml(absPath)}</file>`
          }
        } catch (err: any) {
          return `  <file>${escapeXml(absPath)}</file>`
        }
      })
    )
    requiredFilesXml = `\n\n<must_read_files>
  <description>以下是当前工作空间的必读文件清单。你在处理文件、执行任务或进行回复时，必须严格遵循这些文件中的定义、规范 and 设定：</description>
${fileBlocks.join("\n")}
</must_read_files>`
  }

  // 2. System Instructions
  let skillInstruction = ""
  if (skill?.promptTemplate) {
    const rendered = skill.promptTemplate
      .replace(/\{\{page\.title\}\}/g, pageTitle)
      .replace(/\{\{page\.url\}\}/g, pageUrl)
      .replace(/\{\{bundleDir\}\}/g, bundleDir)
    // 增加缩进以保持 XML 美观
    const indented = rendered.split("\n").map(line => line ? `    ${line}` : "").join("\n")
    skillInstruction = `\n  <skill_instruction>\n${indented}\n  </skill_instruction>`
  }

  const hasScreenshots = clipboardImages.length > 0
  const screenshotInstruction = hasScreenshots
    ? `注意：用户在聊天框中粘贴了截图，已保存在 ${bundleDir}/images/ 目录下，文件名可在下方 <user_screenshots> 标签中查看。在需要分析界面布局、截图细节或报错文字时，请结合图片位置进行关联阅读，必要时可使用相关的分析/识别工具读取其内容。`
    : ""

  const generalInstructionText = hasValidPage
    ? `注意：网页中的截图（如在 page.md 或 XML 上下文中引用的图片）已转换并保存在 ${bundleDir}/images/ 目录下。具体文件名映射和 Alt 说明可在 metadata.json 的 "images" 数组中查看。在需要分析界面布局、截图细节或报错文字时，请结合图片位置及本地图片文件进行关联阅读，必要时可使用相关的分析/识别工具读取其内容。
    同时，你也应该优先阅读本地的 ${bundleDir}/page.md、${bundleDir}/metadata.json 以及 ${bundleDir}/conversation.md 文件以确认上下文细节；${screenshotInstruction}`
    : `提示：你可以阅读本地的 ${bundleDir}/conversation.md 文件以确认会话上下文细节；conversation.md 由后端从持久化会话记录生成，已做窗口裁剪，用于不同 Agent 切换时共享同一会话记忆。${screenshotInstruction ? `\n    ${screenshotInstruction}` : ""}`

  const systemInstructions = `<system_instructions>
  <general_instruction>
    ${generalInstructionText}
  </general_instruction>${skillInstruction}
</system_instructions>`

  // 3. Current Task
  const lastMessage = messages.at(-1)?.content ?? command
  let screenshotsXml = ""
  if (hasScreenshots) {
    const imgBlocks = clipboardImages.map(img => {
      const pathPart = bundleDir ? `\n      <localPath>${escapeXml(`${bundleDir}/images/${img.filename}`)}</localPath>` : ""
      return `    <screenshot>
      <filename>${escapeXml(img.filename)}</filename>${pathPart}
    </screenshot>`
    }).join("\n")
    screenshotsXml = `\n  <user_screenshots>\n${imgBlocks}\n  </user_screenshots>`
  }

  const currentTask = `<current_task>
  <command>${command}</command>
  <user_request>${escapeXml(lastMessage)}</user_request>${screenshotsXml}
</current_task>`

  const workspaceGuidelines = `<workspace_guidelines>
  <rule>你当前运行在工作空间根目录（Cwd）下: ${workspaceRoot}。</rule>
  <rule>【重要】在修改文件、执行操作或进行答复前，应当主动使用工具（如列出目录、查找或阅读文件）了解该工作空间的实际文件布局与内容上下文，避免凭空猜测。</rule>
  <rule>若提供了<must_read_files>，其中包含了你必须严格遵守的规则与规范，请确保后续一切操作与回复均符合其要求。</rule>
</workspace_guidelines>`

  const antiForgetWarning = `\n\n<workspace_reminder>\n  [注意] 你的当前工作空间在 ${workspaceRoot}。为确保任务准确，请优先使用工具查看此目录下的相关文件，切忌直接凭空猜测回复。\n</workspace_reminder>`

  return `${sessionContext}${requiredFilesXml}\n\n${workspaceGuidelines}\n\n${systemInstructions}\n\n${currentTask}${antiForgetWarning}`
}
