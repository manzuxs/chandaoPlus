import { describe, expect, it } from "vitest"
import { formatPageCapturePreview } from "./page-capture"

describe("page-capture", () => {
  it("formats a readable page preview without base64 image payloads", () => {
    const preview = formatPageCapturePreview({
      url: "https://zentao.local/bug-view-2.html",
      title: "BUG #2",
      markdown: "# BUG #2\n\n复现步骤",
      images: [
        {
          filename: "image-1.png",
          alt: "截图1",
          mimeType: "image/png",
          sourceUrl: "https://zentao.local/file-read-2.png",
          base64Data: "should-not-appear"
        }
      ],
      metadata: {
        pageKind: "zentao-bug-detail",
        bugId: "2"
      }
    })

    expect(preview).toContain("<page_context>")
    expect(preview).toContain("<url>https://zentao.local/bug-view-2.html</url>")
    expect(preview).toContain("<title>BUG #2</title>")
    expect(preview).toContain("<pageKind>zentao-bug-detail</pageKind>")
    expect(preview).toContain("<bugId>2</bugId>")
    expect(preview).toContain("<sourceUrl>https://zentao.local/file-read-2.png</sourceUrl>")
    expect(preview).toContain("# BUG #2")
    expect(preview).not.toContain("should-not-appear")
    expect(preview).not.toContain("base64Data")
  })
})
