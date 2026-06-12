import type { PageCapture } from "@chandaoplus/shared"

function getMockPageCapture(): PageCapture {
  return {
    url: "https://zentao.local/mock-bug.html",
    title: "Mock Bug",
    markdown: "# Mock Bug Context",
    images: [],
    metadata: {}
  }
}

export async function captureActiveTabPage(): Promise<PageCapture> {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
    return getMockPageCapture()
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "CAPTURE_ACTIVE_TAB" }, (response: any) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      if (!response) {
        reject(new Error("No capture response received from background worker"))
        return
      }

      if (response.error) {
        reject(new Error(response.error))
        return
      }

      resolve(response as PageCapture)
    })
  })
}

export function formatPageCapturePreview(capture: PageCapture): string {
  const metadataText = Object.keys(capture.metadata).length > 0
    ? JSON.stringify(capture.metadata, null, 2)
    : "{}"

  const imageLines = capture.images.length > 0
    ? capture.images.map((image, index) =>
        [
          `- 图片 ${index + 1}`,
          `  filename: ${image.filename}`,
          `  alt: ${image.alt || "(empty)"}`,
          `  mimeType: ${image.mimeType}`,
          `  sourceUrl: ${image.sourceUrl}`
        ].join("\n")
      ).join("\n")
    : "- 无"

  return [
    `URL: ${capture.url}`,
    `标题: ${capture.title}`,
    "",
    "Metadata:",
    metadataText,
    "",
    "Images:",
    imageLines,
    "",
    "Markdown:",
    capture.markdown
  ].join("\n")
}
