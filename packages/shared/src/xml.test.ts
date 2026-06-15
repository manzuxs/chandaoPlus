import { describe, expect, it } from "vitest"
import { formatPageCaptureToXml, escapeXml } from "./xml"

describe("xml utils", () => {
  describe("escapeXml", () => {
    it("escapes special XML characters", () => {
      expect(escapeXml("a < b & c > d \" e ' f")).toBe("a &lt; b &amp; c &gt; d &quot; e &apos; f")
    })
  })

  describe("formatPageCaptureToXml", () => {
    it("deconstructs zentao markdown correctly", () => {
      const page = {
        url: "https://zentao.local/bug-1.html",
        title: "页面打不开",
        markdown: [
          "# BUG #1 页面打不开",
          "",
          "一些前言介绍内容。",
          "",
          "## 重现步骤",
          "1. 打开首页",
          "2. 点击登录",
          "",
          "## 基本信息",
          "指派给: 张三",
          "",
          "## 历史记录",
          "- 评论: 已经修复了",
          "",
          "## 其它章节",
          "一些其它信息"
        ].join("\n"),
        images: [
          {
            filename: "img1.png",
            alt: "截图",
            mimeType: "image/png",
            sourceUrl: "https://zentao.local/img1.png",
            base64Data: "abc"
          }
        ],
        metadata: {
          bugId: "1",
          status: "active"
        }
      }

      const xml = formatPageCaptureToXml(page, "/tmp/bundle")

      // 验证基本的 XML 节点
      expect(xml).toContain("<page_context>")
      expect(xml).toContain("<url>https://zentao.local/bug-1.html</url>")
      expect(xml).toContain("<title>页面打不开</title>")
      expect(xml).toContain("<bugId>1</bugId>")
      expect(xml).toContain("<status>active</status>")

      // 验证图片节点和 localPath
      expect(xml).toContain("<filename>img1.png</filename>")
      expect(xml).toContain("<localPath>/tmp/bundle/images/img1.png</localPath>")

      // 验证 Markdown 的解构标签
      expect(xml).toContain("<intro># BUG #1 页面打不开\n\n一些前言介绍内容。</intro>")
      expect(xml).toContain("<steps_to_reproduce>\n1. 打开首页\n2. 点击登录\n  </steps_to_reproduce>")
      expect(xml).toContain("<basic_info>\n指派给: 张三\n  </basic_info>")
      expect(xml).toContain("<history_records>\n- 评论: 已经修复了\n  </history_records>")
      expect(xml).toContain('<section name="其它章节">\n一些其它信息\n  </section>')
    })

    it("falls back to page_content_markdown when no markdown headers", () => {
      const page = {
        url: "https://example.com",
        title: "Hello",
        markdown: "Hello World",
        images: [],
        metadata: {}
      }

      const xml = formatPageCaptureToXml(page)
      expect(xml).toContain("<page_content_markdown>\nHello World\n  </page_content_markdown>")
    })
  })
})
