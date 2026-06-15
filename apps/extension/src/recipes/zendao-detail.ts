import { extractPageCapture } from "@chandaoplus/extractor"
import type { PageCapture } from "@chandaoplus/shared"

const DETAIL_PATH_PATTERN = /bug-view-\d+/i
const SANITIZE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "link",
  "meta",
  ".toolbar",
  ".btn-toolbar",
  ".main-actions",
  ".actions",
  ".nav",
  ".breadcrumb",
  ".pager",
  ".dropdown-menu",
  ".modal",
  ".popover"
].join(", ")

function normalizeText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim()
}

async function parseDocument(html: string, baseUrl: string): Promise<Document> {
  if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
    const parser = new window.DOMParser()
    return parser.parseFromString(html, "text/html")
  }

  // @ts-ignore - Node test fallback only
  const { JSDOM } = await import("jsdom")
  return new JSDOM(html, { url: baseUrl }).window.document
}

function getBugIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const bugId = parsed.searchParams.get("bugID") || parsed.searchParams.get("bugId") || parsed.searchParams.get("id")
    if (bugId) return bugId
  } catch {}

  return url.match(/bug-view-(\d+)/i)?.[1] ?? ""
}

function pickFirstElement(root: ParentNode, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const element = root.querySelector(selector)
    if (element) return element
  }
  return null
}

function decodeHtml(document: Document, value: string): string {
  const textarea = document.createElement("textarea")
  textarea.innerHTML = value
  return textarea.value
}

function htmlToPlainText(document: Document, value: string): string {
  const wrapper = document.createElement("div")
  wrapper.innerHTML = decodeHtml(document, value)
  return normalizeText(wrapper.textContent)
}

function sanitizeClone(element: Element): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll(SANITIZE_SELECTORS).forEach((node) => node.remove())
  clone.querySelectorAll('[zui-key="historyWrapper"], #history, .history, #actionbox, #historyBox').forEach((node) => node.remove())
  clone.querySelectorAll("[hidden]").forEach((node) => node.remove())
  clone.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach((node) => node.remove())
  clone.querySelectorAll('img[src*="static/svg/chat.svg"]').forEach((node) => node.remove())
  return clone
}

function buildHistorySection(document: Document, root: ParentNode): HTMLElement | null {
  const historyHost =
    pickFirstElement(root, ['[zui-key="historyWrapper"] [zui-create-historypanel]', '[zui-create-historypanel]']) ||
    null

  const historyAttribute = historyHost?.getAttribute("zui-create-historypanel")
  if (!historyAttribute) return null

  try {
    const payload = JSON.parse(historyAttribute.replace(/\r?\n/g, "\\n")) as {
      actions?: Array<{
        id?: string
        content?: string
        comment?: string
        historyChanges?: string
      }>
    }

    const sortedActions = (payload.actions || []).slice().sort((a, b) => {
      const idA = parseInt(a.id || "0", 10)
      const idB = parseInt(b.id || "0", 10)
      return idA - idB
    })

    const items = sortedActions
      .map((action) => {
        const content = htmlToPlainText(document, action.content || "")
        const comment = htmlToPlainText(document, action.comment || "")
        const historyChanges = htmlToPlainText(document, action.historyChanges || "")
        if (!content && !comment && !historyChanges) return null

        const item = document.createElement("li")
        if (content) {
          const contentParagraph = document.createElement("p")
          contentParagraph.textContent = content
          item.appendChild(contentParagraph)
        }
        if (comment) {
          const commentParagraph = document.createElement("p")
          commentParagraph.textContent = comment
          item.appendChild(commentParagraph)
        }
        if (historyChanges && !comment) {
          const changeParagraph = document.createElement("p")
          changeParagraph.textContent = historyChanges
          item.appendChild(changeParagraph)
        }
        return item
      })
      .filter((item): item is HTMLLIElement => Boolean(item))

    if (!items.length) return null

    const section = document.createElement("section")
    const heading = document.createElement("h2")
    heading.textContent = "历史记录"
    section.appendChild(heading)

    const list = document.createElement("ul")
    items.forEach((item) => list.appendChild(item))
    section.appendChild(list)
    return section
  } catch (err) {
    console.error("Failed to parse zentao history panel:", err)
    return null
  }
}

function buildFocusedHtml(document: Document): string {
  const root =
    pickFirstElement(document, ["#mainContent", "#mainContent .main", "#mainContent .main-row"]) ||
    document.body

  const titleElement = pickFirstElement(root, [".entity-title-text", "h1", ".main-header h1", ".main-title"])
  const mainElement =
    pickFirstElement(root, ['.detail-sections[zui-key="main"]', ".detail-main", ".main-col", ".main-content", ".detail-content", ".article-content", ".content"]) ||
    root
  const sideElement = pickFirstElement(root, [".detail-side", ".side-col", "aside"])
  const historyElement = buildHistorySection(document, root)

  const wrapper = document.createElement("article")
  const seen = new Set<Element>()

  const appendIfNeeded = (element: Element | null) => {
    if (!element || seen.has(element)) return
    if (Array.from(seen).some((selected) => selected.contains(element))) return
    seen.add(element)
    wrapper.appendChild(sanitizeClone(element))
  }

  appendIfNeeded(titleElement)
  appendIfNeeded(mainElement)
  if (historyElement) {
    wrapper.appendChild(historyElement)
  }

  if (!wrapper.children.length) {
    wrapper.appendChild(sanitizeClone(root))
  }

  return wrapper.innerHTML
}

function extractMetadata(document: Document, url: string, fallbackTitle: string): Record<string, string> {
  const root = pickFirstElement(document, ["#mainContent", "body"]) || document.body
  const title = normalizeText(
    pickFirstElement(root, [".entity-title-text", "h1", ".main-header h1", ".main-title"])?.textContent
  ) || fallbackTitle
  const status = normalizeText(pickFirstElement(root, [".status", ".bug-status"])?.textContent)
  const assignedTo = normalizeText(pickFirstElement(root, [".assignedTo", ".assigned-to"])?.textContent)

  const metadata: Record<string, string> = {
    pageKind: "zentao-bug-detail",
    bugId: getBugIdFromUrl(url),
    title
  }

  if (status) metadata.status = status
  if (assignedTo) metadata.assignedTo = assignedTo

  return metadata
}

export function isZentaoBugDetailUrl(url: string): boolean {
  if (DETAIL_PATH_PATTERN.test(url)) return true

  try {
    const parsed = new URL(url)
    return parsed.searchParams.get("m") === "bug" &&
      parsed.searchParams.get("f") === "view" &&
      Boolean(parsed.searchParams.get("bugID") || parsed.searchParams.get("bugId") || parsed.searchParams.get("id"))
  } catch {
    return false
  }
}

export async function extractZentaoBugDetailPageCapture(input: {
  url: string
  html: string
  title: string
}): Promise<PageCapture | null> {
  if (!isZentaoBugDetailUrl(input.url)) return null

  const document = await parseDocument(input.html, input.url)
  const metadata = extractMetadata(document, input.url, input.title)
  const focusedHtml = buildFocusedHtml(document)
  const capture = await extractPageCapture({
    html: focusedHtml,
    baseUrl: input.url,
    title: metadata.title || input.title
  })

  return {
    ...capture,
    title: metadata.title || capture.title,
    metadata
  }
}

export async function detectZentaoBugDetail(input: { url: string; html: string; title?: string }) {
  const capture = await extractZentaoBugDetailPageCapture({
    url: input.url,
    html: input.html,
    title: input.title || ""
  })

  if (!capture) return null

  return {
    metadata: capture.metadata
  }
}
