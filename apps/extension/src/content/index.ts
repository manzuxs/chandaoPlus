import { extractPageCapture, hydrateImageAssets } from "@chandaoplus/extractor"
import type { PageCapture } from "@chandaoplus/shared"
import { detectZentaoBugDetail, extractZentaoBugDetailPageCapture } from "../recipes/zendao-detail"
import { collectZentaoBugLinks, collectZentaoBugListStatus, isZentaoBugListUrl } from "../recipes/zendao-list"

console.log("[chandaoPlus] Content script injected on page:", window.location.href)

let statusReportTimer: number | null = null

function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && /Extension context invalidated/i.test(error.message)
}

function hasRuntimeContext(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id)
}

function stopStatusReporter() {
  if (statusReportTimer !== null) {
    window.clearInterval(statusReportTimer)
    statusReportTimer = null
  }
}

async function safeRuntimeSendMessage(message: unknown): Promise<boolean> {
  if (!hasRuntimeContext()) {
    stopStatusReporter()
    return false
  }

  try {
    await chrome.runtime.sendMessage(message)
    return true
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      stopStatusReporter()
      return false
    }

    throw error
  }
}

async function fetchImageBase64(imgUrl: string): Promise<string> {
  const response = await fetch(imgUrl)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      const base64 = result.split(",")[1] || ""
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function buildPageCapture(input: { html: string; url: string; title: string }): Promise<PageCapture> {
  const zentaoCapture = await extractZentaoBugDetailPageCapture({
    url: input.url,
    html: input.html,
    title: input.title
  })

  if (zentaoCapture) return zentaoCapture

  return extractPageCapture({
    html: input.html,
    baseUrl: input.url,
    title: input.title
  })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_HTML") {
    sendResponse({ html: document.documentElement.outerHTML, title: document.title })
    return
  }



  if (message.type !== "CAPTURE_CURRENT_PAGE") return

  const html = document.documentElement.outerHTML
  const url = window.location.href
  const title = document.title

  if (isZentaoBugListUrl(url)) {
    const bugLinks = collectZentaoBugLinks({ url, html, baseUrl: url, liveDocument: document })
    if (bugLinks.length === 0) {
      sendResponse({ error: "No bug links found on list page" })
      return true
    }

    (async () => {
      try {
        const captures: PageCapture[] = []
        for (let i = 0; i < bugLinks.length; i++) {
          const bugUrl = bugLinks[i]
          try {
            void safeRuntimeSendMessage({
              type: "CAPTURE_PROGRESS",
              content: `正在抓取并处理第 ${i + 1}/${bugLinks.length} 个 BUG...`
            }).catch(() => {})
          } catch {}

          const fetchRes = await fetch(bugUrl, { credentials: "include" })
          if (!fetchRes.ok) {
            throw new Error(`Failed to fetch bug detail from ${bugUrl}`)
          }
          const htmlText = await fetchRes.text()

          let bugCapture = await buildPageCapture({
            html: htmlText,
            url: bugUrl,
            title: `BUG ${i + 1}`
          })

          bugCapture = await hydrateImageAssets(fetchImageBase64, bugCapture)

          const zentaoMatch = await detectZentaoBugDetail({ url: bugUrl, html: htmlText, title: `BUG ${i + 1}` })
          if (zentaoMatch) {
            bugCapture.metadata = {
              ...bugCapture.metadata,
              ...zentaoMatch.metadata
            }
          }

          captures.push(bugCapture)
        }

        const combinedPage = {
          url,
          title: `ZenTao Batch ${captures.length}`,
          markdown: captures.map((item, index) => `## BUG ${index + 1}\n\n${item.markdown}`).join("\n\n"),
          images: captures.flatMap((item) => item.images),
          metadata: {
            pageKind: "zentao-bug-list",
            batchSize: String(captures.length)
          }
        }
        sendResponse(combinedPage)
      } catch (err: any) {
        console.error("Batch capture failed:", err)
        sendResponse({ error: err.message })
      }
    })()

    return true
  }

  // Standard single page flow
  buildPageCapture({
    html,
    url,
    title
  })
    .then((capture: PageCapture) => hydrateImageAssets(fetchImageBase64, capture))
    .then(async (hydratedCapture: PageCapture) => {
      // Enrich with ZenTao metadata if applicable
      const zentaoMatch = await detectZentaoBugDetail({ url, html, title })
      if (zentaoMatch) {
        hydratedCapture.metadata = {
          ...hydratedCapture.metadata,
          ...zentaoMatch.metadata
        }
      }
      sendResponse(hydratedCapture)
    })
    .catch((err: any) => {
      console.error("Page capture extraction failed:", err)
      sendResponse({ error: err.message })
    })

  return true
})

const reportStatus = () => {
  if (!hasRuntimeContext()) {
    stopStatusReporter()
    return
  }

  const url = window.location.href
  if (!isZentaoBugListUrl(url)) return

  const html = document.documentElement.outerHTML
  const { items, isAnyChecked } = collectZentaoBugListStatus({
    url,
    html,
    baseUrl: url,
    liveDocument: document
  })

  void safeRuntimeSendMessage({
    type: "ZENTAO_LIST_STATUS_REPORT",
    items,
    isAnyChecked,
    url
  }).catch(() => {})
}

reportStatus()
statusReportTimer = window.setInterval(reportStatus, 1500)
