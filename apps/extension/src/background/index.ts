import type { PageCapture } from "@chandaoplus/shared"

async function captureZentaoBugDetailFromLiveDom(): Promise<PageCapture | null> {
  const currentUrl = window.location.href
  let parsedUrl: URL
  try {
    parsedUrl = new URL(currentUrl)
  } catch {
    return null
  }

  const bugId = parsedUrl.searchParams.get("bugID") || parsedUrl.searchParams.get("bugId") || currentUrl.match(/bug-view-(\d+)/i)?.[1] || ""
  const isBugDetail =
    /bug-view-\d+/i.test(currentUrl) ||
    (parsedUrl.searchParams.get("m") === "bug" && parsedUrl.searchParams.get("f") === "view" && Boolean(bugId))

  if (!isBugDetail) return null

  const parseHtml = (html: string) => new DOMParser().parseFromString(html, "text/html")
  const normalizeText = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim()
  const normalizeBlockText = (value: string | null | undefined) =>
    (value || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  const extractUsefulHtml = (value: unknown): string => {
    if (typeof value === "string") return value
    if (Array.isArray(value)) return value.map(extractUsefulHtml).join("\n")
    if (value && typeof value === "object") {
      return Object.values(value as Record<string, unknown>).map(extractUsefulHtml).join("\n")
    }
    return ""
  }

  const absoluteUrl = (value: string) => {
    try {
      return new URL(value, currentUrl).toString()
    } catch {
      return value
    }
  }

  const decodeJsonString = (value: string) => {
    try {
      return JSON.parse(`"${value.replace(/\r?\n/g, "\\n")}"`) as string
    } catch {
      return value
    }
  }

  const decodeHtmlEntities = (targetDocument: Document, value: string) => {
    const textarea = targetDocument.createElement("textarea")
    textarea.innerHTML = value
    return textarea.value
  }

  const decodeHtmlText = (targetDocument: Document, value: string) => {
    const jsonDecoded = decodeJsonString(value).replace(/\\\//g, "/")
    const wrapper = targetDocument.createElement("div")
    wrapper.innerHTML = decodeHtmlEntities(targetDocument, jsonDecoded)
    return normalizeText(wrapper.textContent)
  }

  const getElementText = (element: Element | null): string => {
    if (!element) return ""
    const htmlElement = element as HTMLElement
    if (htmlElement.innerText) return normalizeBlockText(htmlElement.innerText)

    const blockTexts = Array.from(element.querySelectorAll("p, li, tr, h1, h2, h3, h4"))
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean)
    if (blockTexts.length > 0) return blockTexts.join("\n")

    return normalizeBlockText(element.textContent)
  }

  const extractHistoryLines = (
    targetDocument: Document,
    payload: { actions?: Array<{ content?: string; comment?: string; historyChanges?: string }> }
  ) => (payload.actions || [])
    .map((action) => {
      const content = decodeHtmlText(targetDocument, action.content || "")
      const comment = decodeHtmlText(targetDocument, action.comment || "")
      const historyChanges = decodeHtmlText(targetDocument, action.historyChanges || "")
      return [content, comment || historyChanges].filter(Boolean).join("\n")
    })
    .filter(Boolean)

  const uniqueHistoryLines = (lines: string[]) => {
    const seen = new Set<string>()
    return lines.filter((line) => {
      const key = normalizeText(line)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const extractHistoryLinesFromSource = (targetDocument: Document, sourceText: string) => {
    const decodeAttribute = (value: string) => {
      return decodeHtmlEntities(targetDocument, value)
    }

    const attributeMatch = sourceText.match(/zui-create-historypanel=\\?"([\s\S]*?)\\?"(?:\s|>|\/)/)
    if (attributeMatch) {
      const candidates = [
        decodeAttribute(attributeMatch[1]),
        decodeAttribute(attributeMatch[1].replace(/\\"/g, "\""))
      ]
      for (const candidate of candidates) {
        try {
          return extractHistoryLines(targetDocument, JSON.parse(candidate.replace(/\r?\n/g, "\\n")))
        } catch {}
      }
    }

    const decoded = decodeAttribute(sourceText)
    const commentMatches = Array.from(decoded.matchAll(/"comment"\s*:\s*"((?:\\.|[^"\\])*)"/g))

    return commentMatches
      .map((match) => decodeHtmlText(targetDocument, match[1]))
      .filter(Boolean)
  }

  const buildCapture = (targetDocument: Document, captureSource: string, sourceText = ""): PageCapture | null => {
    const root = targetDocument.querySelector("#mainContent") || targetDocument.querySelector("#main") || targetDocument.body
    const titleElement = root.querySelector(".entity-title-text, h1, .main-header h1, .main-title")
    const title = normalizeText(titleElement?.textContent) || document.title
    const status = normalizeText(root.querySelector(".status, .bug-status")?.textContent)
    const assignedTo = normalizeText(root.querySelector(".assignedTo, .assigned-to")?.textContent)
    const markdownParts: string[] = [`# BUG #${bugId} ${title}`.trim()]

    const appendSection = (heading: string, body: string) => {
      const text = normalizeBlockText(body)
      if (!text) return
      markdownParts.push(`## ${heading}`)
      markdownParts.push(text)
    }

    root.querySelectorAll('.detail-sections[zui-key="main"] .detail-section').forEach((section) => {
      const heading =
        normalizeText(section.querySelector(".detail-section-title")?.textContent) ||
        section.getAttribute("zui-key") ||
        "详情"
      const content = section.querySelector(".detail-section-content") || section
      appendSection(heading, getElementText(content))
    })

    if (markdownParts.length === 1) {
      const mainElement = root.querySelector('.detail-sections[zui-key="main"], .detail-main, .main-col, .main-content, .detail-content, .article-content, .content')
      appendSection("BUG详情", getElementText(mainElement))
    }

    const sideElement = root.querySelector(".detail-side, .side-col, aside")
    appendSection("基本信息", getElementText(sideElement))

    const historyHost = root.querySelector('[zui-key="historyWrapper"] [zui-create-historypanel], [zui-create-historypanel]')
    const historyAttribute = historyHost?.getAttribute("zui-create-historypanel")
    let historyLines: string[] = []
    if (historyAttribute) {
      try {
        historyLines = extractHistoryLines(targetDocument, JSON.parse(historyAttribute.replace(/\r?\n/g, "\\n")) as {
          actions?: Array<{ content?: string; comment?: string; historyChanges?: string }>
        })
      } catch (err) {
        console.error("Failed to parse live ZenTao history:", err)
      }
    }
    if (historyLines.length === 0 && sourceText) {
      historyLines = extractHistoryLinesFromSource(targetDocument, sourceText)
    }
    historyLines = uniqueHistoryLines(historyLines)
    if (historyLines.length > 0) {
      markdownParts.push("## 历史记录")
      markdownParts.push(historyLines.map((line) => `- ${line.replace(/\n/g, "\n  ")}`).join("\n"))
    }

    const images = Array.from(root.querySelectorAll("img"))
      .filter((image) => {
        const src = image.getAttribute("src") || ""
        return src && !src.includes("static/svg/chat.svg")
      })
      .slice(0, 8)
      .map((image, index) => ({
        filename: `image-${index + 1}.png`,
        alt: image.getAttribute("alt") || "",
        mimeType: "image/png",
        sourceUrl: absoluteUrl(image.getAttribute("src") || ""),
        base64Data: ""
      }))

    const metadata: Record<string, string> = {
      pageKind: "zentao-bug-detail",
      captureSource,
      bugId,
      title
    }
    if (status) metadata.status = status
    if (assignedTo) metadata.assignedTo = assignedTo

    const markdown = markdownParts.filter(Boolean).join("\n\n")

    // 如果内容只有标题（没有提取到 BUG 详情），返回 null 触发后续 fallback
    if (markdownParts.length <= 1) {
      return null
    }

    return {
      url: currentUrl,
      title,
      markdown,
      images,
      metadata
    }
  }

  const liveCapture = buildCapture(document, "live-dom", document.documentElement.outerHTML)
  if (liveCapture) return liveCapture

  try {
    const apiUrl = new URL(currentUrl)
    apiUrl.searchParams.set("zin", "1")
    const response = await fetch(apiUrl.toString(), {
      credentials: "include",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "X-ZIN-App": "qa",
        "X-ZIN-Options": JSON.stringify({
          selector: ["#configJS", "title>*", "body>*", "zinDebug()"],
          type: "list"
        }),
        "X-Zin-Cache-Time": "0"
      }
    })

    if (!response.ok) return null

    const text = await response.text()
    let html = text
    try {
      html = extractUsefulHtml(JSON.parse(text))
    } catch {}

    if (!html) return null
    return buildCapture(parseHtml(html), "zin-api", `${text}\n${html}`)
  } catch (err) {
    console.error("Failed to fetch ZenTao zin detail:", err)
    return null
  }
}

async function captureActiveTabPage(chromeApi = chrome): Promise<PageCapture> {
  const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab || !tab.id) {
    throw new Error("No active tab found")
  }

  if (chromeApi.scripting?.executeScript) {
    const injected = await chromeApi.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: captureZentaoBugDetailFromLiveDom
    })
    const liveCapture = injected?.find((item: { result?: PageCapture | null }) => Boolean(item.result))?.result
    if (liveCapture) return liveCapture
  }

  return chromeApi.tabs.sendMessage(tab.id, { type: "CAPTURE_CURRENT_PAGE" })
}

export async function runChatFromActiveTab({
  chromeApi = chrome,
  gatewayClient,
  workspaceId,
  agent,
  command,
  message
}: any) {
  const page = await captureActiveTabPage(chromeApi)
  return gatewayClient.startStream({
    workspaceId,
    agent,
    command,
    page,
    messages: [{ role: "user", content: message }]
  })
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CAPTURE_ACTIVE_TAB") {
      captureActiveTabPage()
        .then((response) => sendResponse(response))
        .catch((err: any) => sendResponse({ error: err.message }))
      return true
    }
  })
}

// Enable left-click on extension action icon to open sidepanel directly
if (typeof chrome !== "undefined" && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.error("Failed to set sidepanel behavior:", err)
  })
}
