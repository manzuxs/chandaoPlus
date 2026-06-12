import TurndownService from "turndown"
import type { PageCapture } from "@chandaoplus/shared"

const MAX_IMAGES = 8

export async function extractPageCapture(input: { html: string; baseUrl: string; title: string }): Promise<PageCapture> {
  let document: Document

  if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
    const parser = new window.DOMParser()
    document = parser.parseFromString(input.html, "text/html")
  } else {
    // @ts-ignore - Dynamic import for Node environment only
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM(input.html, { url: input.baseUrl })
    document = dom.window.document
  }

  // Remove script, style, noscript, iframe, link, meta and hidden elements to keep only clean page content
  document.querySelectorAll("script, style, noscript, iframe, link, meta").forEach((el) => {
    el.parentNode?.removeChild(el)
  })
  document.querySelectorAll("[hidden]").forEach((el) => {
    el.parentNode?.removeChild(el)
  })
  document.querySelectorAll('[style*="display: none"]').forEach((el) => {
    el.parentNode?.removeChild(el)
  })
  document.querySelectorAll('[style*="display:none"]').forEach((el) => {
    el.parentNode?.removeChild(el)
  })

  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" })

  const images = Array.from(document.querySelectorAll("img")).slice(0, MAX_IMAGES).map((img, index) => {
    const src = img.getAttribute("src") ?? ""
    let absoluteUrl = ""
    try {
      absoluteUrl = new URL(src, input.baseUrl).toString()
    } catch {
      absoluteUrl = src
    }

    return {
      filename: `image-${index + 1}.png`,
      alt: img.getAttribute("alt") ?? "",
      mimeType: "image/png",
      sourceUrl: absoluteUrl,
      base64Data: ""
    }
  })

  return {
    url: input.baseUrl,
    title: input.title,
    markdown: turndown.turndown(document.body.innerHTML),
    images,
    metadata: {}
  }
}

export async function hydrateImageAssets(
  fetcher: (url: string) => Promise<string>,
  capture: PageCapture
): Promise<PageCapture> {
  const hydrated = await Promise.all(
    capture.images.map(async (image) => {
      try {
        const base64Data = await fetcher(image.sourceUrl)
        return { ...image, base64Data }
      } catch (err) {
        console.error(`Failed to hydrate image ${image.sourceUrl}:`, err)
        return image
      }
    })
  )

  return { ...capture, images: hydrated }
}
