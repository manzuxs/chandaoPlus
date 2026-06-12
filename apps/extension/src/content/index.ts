import { extractPageCapture, hydrateImageAssets } from "@chandaoplus/extractor"
import type { PageCapture } from "@chandaoplus/shared"
import { detectZentaoBugDetail } from "../recipes/zendao-detail"
import { collectZentaoBugLinks } from "../recipes/zendao-list"

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_HTML") {
    sendResponse({ html: document.documentElement.outerHTML, title: document.title })
    return
  }

  if (message.type !== "CAPTURE_CURRENT_PAGE") return

  const html = document.documentElement.outerHTML
  const url = window.location.href
  const title = document.title

  if (/bug-browse-/.test(url)) {
    const bugLinks = collectZentaoBugLinks({ url, html, baseUrl: url })
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
            chrome.runtime.sendMessage({
              type: "CAPTURE_PROGRESS",
              content: `正在抓取并处理第 ${i + 1}/${bugLinks.length} 个 BUG...`
            }).catch(() => {})
          } catch {}

          const fetchRes = await fetch(bugUrl, { credentials: "include" })
          if (!fetchRes.ok) {
            throw new Error(`Failed to fetch bug detail from ${bugUrl}`)
          }
          const htmlText = await fetchRes.text()

          let bugCapture = await extractPageCapture({
            html: htmlText,
            baseUrl: bugUrl,
            title: `BUG ${i + 1}`
          })

          bugCapture = await hydrateImageAssets(fetchImageBase64, bugCapture)

          const zentaoMatch = detectZentaoBugDetail({ url: bugUrl, html: htmlText })
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
  extractPageCapture({
    html,
    baseUrl: url,
    title
  })
    .then((capture: PageCapture) => hydrateImageAssets(fetchImageBase64, capture))
    .then((hydratedCapture: PageCapture) => {
      // Enrich with ZenTao metadata if applicable
      const zentaoMatch = detectZentaoBugDetail({ url, html })
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
