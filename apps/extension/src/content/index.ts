import { extractPageCapture, hydrateImageAssets } from "@chandaoplus/extractor"
import type { PageCapture } from "@chandaoplus/shared"
import { detectZentaoBugDetail, extractZentaoBugDetailPageCapture, detectZentaoTaskDetail, extractZentaoTaskDetailPageCapture, isZentaoBugDetailUrl, isZentaoTaskDetailUrl } from "../recipes/zendao-detail"
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

function getZentaoZinApp(url: string): string {
  if (isZentaoBugDetailUrl(url)) return "qa"
  if (isZentaoTaskDetailUrl(url)) return "execution"
  return "project"
}

async function buildPageCapture(input: { html: string; url: string; title: string }): Promise<PageCapture> {
  const isZentaoBug = isZentaoBugDetailUrl(input.url)
  const isZentaoTask = isZentaoTaskDetailUrl(input.url)

  let zentaoCapture: PageCapture | null = null

  if (isZentaoBug) {
    zentaoCapture = await extractZentaoBugDetailPageCapture({
      url: input.url,
      html: input.html,
      title: input.title
    })
  } else if (isZentaoTask) {
    zentaoCapture = await extractZentaoTaskDetailPageCapture({
      url: input.url,
      html: input.html,
      title: input.title
    })
  }

  if (zentaoCapture && zentaoCapture.markdown && zentaoCapture.markdown.length >= 200) {
    return zentaoCapture
  }

  // 兜底机制：若当前为详情页，但直接提取的 DOM 长度不够/解析失败（外层 SPA 框架包裹所致），则通过 fetch 拉取 pure html
  if (isZentaoBug || isZentaoTask) {
    console.log("[chandaoPlus] Zentao detail detected but captured content is too short or missing. Fetching pure onlybody html...")
    try {
      const fetchUrl = new URL(input.url)
      fetchUrl.searchParams.set("onlybody", "yes")
      const response = await fetch(fetchUrl.toString(), { credentials: "include" })
      if (response.ok) {
        const pureHtml = await response.text()
        const retryCapture = isZentaoBug
          ? await extractZentaoBugDetailPageCapture({ url: input.url, html: pureHtml, title: input.title })
          : await extractZentaoTaskDetailPageCapture({ url: input.url, html: pureHtml, title: input.title })

        if (retryCapture && retryCapture.markdown && retryCapture.markdown.length >= 200) {
          console.log("[chandaoPlus] Successfully retrieved zentao detail via onlybody fetch.")
          return retryCapture
        }

        // onlybody fetch 内容如果还是太短，尝试使用 Zin 接口拉取并格式化
        console.log("[chandaoPlus] onlybody fetch content also too short. Trying Zin API fetch...")
        const zinUrl = new URL(input.url)
        zinUrl.searchParams.set("zin", "1")
        const zinRes = await fetch(zinUrl.toString(), {
          credentials: "include",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            "X-ZIN-App": getZentaoZinApp(input.url),
            "X-ZIN-Options": JSON.stringify({
              selector: ["#configJS", "title>*", "body>*", "zinDebug()"],
              type: "list"
            }),
            "X-Zin-Cache-Time": "0"
          }
        })
        if (zinRes.ok) {
          const zinText = await zinRes.text()
          let parsedHtml = zinText
          try {
            const parsedJson = JSON.parse(zinText)
            const extractUsefulHtml = (value: unknown): string => {
              if (typeof value === "string") return value
              if (Array.isArray(value)) return value.map(extractUsefulHtml).join("\n")
              if (value && typeof value === "object") {
                return Object.values(value as Record<string, unknown>).map(extractUsefulHtml).join("\n")
              }
              return ""
            }
            parsedHtml = extractUsefulHtml(parsedJson)
          } catch {}

          if (parsedHtml) {
            const zinCapture = isZentaoBug
              ? await extractZentaoBugDetailPageCapture({ url: input.url, html: parsedHtml, title: input.title })
              : await extractZentaoTaskDetailPageCapture({ url: input.url, html: parsedHtml, title: input.title })
            if (zinCapture && zinCapture.markdown && zinCapture.markdown.length >= 200) {
              console.log("[chandaoPlus] Successfully retrieved zentao detail via Zin API fetch.")
              return zinCapture
            }
          }
        }
      }
    } catch (err) {
      console.warn("[chandaoPlus] Failed to fetch pure zentao detail html:", err)
    }
  }

  if (zentaoCapture) return zentaoCapture

  return extractPageCapture({
    html: input.html,
    baseUrl: input.url,
    title: input.title
  })
}

function getCurrentZentaoListStatus() {
  const url = window.location.href
  const html = document.documentElement.outerHTML

  return collectZentaoBugListStatus({
    url,
    html,
    baseUrl: url,
    liveDocument: document
  })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_HTML") {
    sendResponse({ html: document.documentElement.outerHTML, title: document.title })
    return
  }

  if (message.type === "GET_ZENTAO_LIST_STATUS") {
    sendResponse(getCurrentZentaoListStatus())
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
      // 若前面 buildPageCapture 中已经借助 onlybody / Zin 兜底提取出正确的 metadata，直接使用，防止被外层 SPA 框架的 html 重复匹配覆盖
      if (hydratedCapture.metadata && (hydratedCapture.metadata.pageKind === "zentao-bug-detail" || hydratedCapture.metadata.pageKind === "zentao-task-detail")) {
        sendResponse(hydratedCapture)
        return
      }

      // Enrich with ZenTao metadata if applicable
      const zentaoMatch = await detectZentaoBugDetail({ url, html, title })
      if (zentaoMatch) {
        hydratedCapture.metadata = {
          ...hydratedCapture.metadata,
          ...zentaoMatch.metadata
        }
      } else {
        const zentaoTaskMatch = await detectZentaoTaskDetail({ url, html, title })
        if (zentaoTaskMatch) {
          hydratedCapture.metadata = {
            ...hydratedCapture.metadata,
            ...zentaoTaskMatch.metadata
          }
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

  const { items, isAnyChecked } = getCurrentZentaoListStatus()

  void safeRuntimeSendMessage({
    type: "ZENTAO_LIST_STATUS_REPORT",
    items,
    isAnyChecked,
    url
  }).catch(() => {})
}

reportStatus()
statusReportTimer = window.setInterval(reportStatus, 1500)

// ── Floating Chat Widget ──
// 仅在 Bug 列表页动态加载悬浮聊天窗口（通过 Shadow DOM 隔离）

let floatingMounted = false
let floatingUnmount: (() => void) | null = null

async function tryMountFloating() {
  const url = window.location.href
  if (isZentaoBugListUrl(url) && !floatingMounted) {
    try {
      const { mountFloatingWidget, unmountFloatingWidget } = await import(
        /* @vite-ignore */
        chrome.runtime.getURL("src/content/floating.js")
      )
      mountFloatingWidget()
      floatingMounted = true
      floatingUnmount = unmountFloatingWidget
    } catch (err) {
      console.error("[chandaoPlus] Failed to mount floating widget:", err)
    }
  } else if (!isZentaoBugListUrl(url) && floatingMounted) {
    floatingUnmount?.()
    floatingMounted = false
    floatingUnmount = null
  }
}

tryMountFloating()

// 监听禅道 SPA 导航（URL 变化但不刷新页面）
let lastUrl = window.location.href
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href
    tryMountFloating()
  }
})
urlObserver.observe(document.documentElement, { childList: true, subtree: true })
