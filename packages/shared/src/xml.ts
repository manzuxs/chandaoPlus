import type { PageCapture } from "./contracts"

/**
 * 转义 XML 特殊字符
 */
export function escapeXml(unsafe: string): string {
  return (unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * 将 Markdown 列表文本正确解析为顶级列表项数组。
 * 每一项以不带缩进或少许缩进的 "-", "*", 或自增数字 "1." 开头。
 * 可以极佳地兼容包含多行、换行、复杂代码块 (curl)、子列表的列表项。
 */
export function splitMarkdownList(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const items: string[][] = []
  let currentItem: string[] = []

  for (const line of lines) {
    const isNewItem = /^ ?(?:-\s+|\d+\.\s+|\*\s+)/.test(line)

    if (isNewItem) {
      if (currentItem.length > 0) {
        items.push(currentItem)
      }
      const cleanedLine = line.replace(/^ ?(?:-\s+|\d+\.\s+|\*\s+)/, "")
      currentItem = [cleanedLine]
    } else {
      if (currentItem.length > 0) {
        currentItem.push(line)
      } else {
        const trimmed = line.trim()
        if (trimmed) {
          currentItem.push(trimmed)
        }
      }
    }
  }

  if (currentItem.length > 0) {
    items.push(currentItem)
  }

  return items
    .map(itemLines => {
      if (itemLines.length <= 1) {
        return itemLines[0] || ""
      }

      // Calculate common minimum indent length for subsequent lines
      let minIndent = Infinity
      const indentLines = itemLines.slice(1)

      for (const line of indentLines) {
        if (!line.trim()) continue
        const match = line.match(/^( +|\t+)/)
        const indentLen = match ? match[0].length : 0
        if (indentLen < minIndent) {
          minIndent = indentLen
        }
      }

      const content = itemLines
        .map((l, idx) => {
          if (idx === 0) return l
          if (minIndent > 0 && minIndent !== Infinity) {
            if (l.startsWith(" ".repeat(minIndent))) {
              return l.substring(minIndent)
            } else if (l.startsWith("\t".repeat(minIndent))) {
              return l.substring(minIndent)
            }
          }
          return l
        })
        .join("\n")
        .trim()
      return content
    })
    .filter(Boolean)
}

/**
 * 将 PageCapture 转换为结构化的 XML
 * 对 Markdown 正文按二级标题进行分区块包裹，特化禅道 Bug 区块标签，同时支持图片和元数据处理。
 */
export function formatPageCaptureToXml(page: PageCapture, bundleDir?: string): string {
  const rawMarkdown = page.markdown || ""
  const headerRegex = /^##\s+(.+)$/gm
  
  let matches: RegExpExecArray | null
  const headerIndices: { title: string; index: number }[] = []
  
  while ((matches = headerRegex.exec(rawMarkdown)) !== null) {
    headerIndices.push({
      title: matches[1].trim(),
      index: matches.index
    })
  }

  let structuredMarkdownXml = ""
  if (headerIndices.length === 0) {
    structuredMarkdownXml = `  <page_content_markdown>
${rawMarkdown}
  </page_content_markdown>`
  } else {
    const intro = rawMarkdown.substring(0, headerIndices[0].index).trim()
    const sectionXmls: string[] = []
    if (intro) {
      sectionXmls.push(`  <intro>${escapeXml(intro)}</intro>`)
    }

    for (let i = 0; i < headerIndices.length; i++) {
      const current = headerIndices[i]
      const next = headerIndices[i + 1]
      
      // 定位段落内容的起始和结束位置
      const start = current.index + current.title.length + 3 
      const end = next ? next.index : rawMarkdown.length
      const blockText = rawMarkdown.substring(start, end).trim()

      const titleLower = current.title.toLowerCase()
      if (titleLower.includes("重现步骤") || titleLower.includes("bug详情") || titleLower.includes("重现")) {
        sectionXmls.push(`  <steps_to_reproduce>\n${blockText}\n  </steps_to_reproduce>`)
      } else if (titleLower.includes("基本信息")) {
        sectionXmls.push(`  <basic_info>\n${blockText}\n  </basic_info>`)
      } else if (titleLower.includes("历史记录") || titleLower.includes("历史")) {
        const items = splitMarkdownList(blockText)
        const recordXmls = items.map(item => `    <record>${item}</record>`).join("\n")
        sectionXmls.push(`  <history_records>\n${recordXmls}\n  </history_records>`)
      } else {
        sectionXmls.push(`  <section name="${escapeXml(current.title)}">\n${blockText}\n  </section>`)
      }
    }
    structuredMarkdownXml = sectionXmls.join("\n")
  }

  // 格式化元数据
  const metadataXml = Object.entries(page.metadata || {})
    .map(([key, val]) => `    <${key}>${escapeXml(val)}</${key}>`)
    .join("\n")

  // 格式化图片
  const imagesXml = (page.images || [])
    .map((img) => {
      const pathPart = bundleDir ? `\n      <localPath>${escapeXml(`${bundleDir}/images/${img.filename}`)}</localPath>` : ""
      return `    <image>
      <filename>${escapeXml(img.filename)}</filename>
      <alt>${escapeXml(img.alt)}</alt>
      <sourceUrl>${escapeXml(img.sourceUrl)}</sourceUrl>${pathPart}
    </image>`
    })
    .join("\n")

  return `<page_context>
  <url>${escapeXml(page.url)}</url>
  <title>${escapeXml(page.title)}</title>
  <metadata>
${metadataXml ? metadataXml : ""}
  </metadata>
  <images>
${imagesXml ? imagesXml : ""}
  </images>
${structuredMarkdownXml}
</page_context>`
}
