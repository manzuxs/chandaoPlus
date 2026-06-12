import { describe, expect, it } from "vitest"
import { extractPageCapture } from "./markdown"

describe("extractPageCapture", () => {
  it("converts bug detail DOM into markdown and image assets", async () => {
    const html = `
      <article>
        <h1>BUG #123 登录失败</h1>
        <p>复现步骤：点击保存按钮后出现 500。</p>
        <pre><code>TypeError: x is undefined</code></pre>
        <img src="/file-read-1.png" alt="报错截图" />
      </article>
    `

    const capture = await extractPageCapture({
      html,
      baseUrl: "https://zentao.local/bug-view-123.html",
      title: "BUG #123"
    })

    expect(capture.markdown).toContain("# BUG #123 登录失败")
    expect(capture.markdown).toContain("```")
    expect(capture.images[0]?.sourceUrl).toBe("https://zentao.local/file-read-1.png")
  })

  it("cleans script, style, hidden and noscript elements before conversion", async () => {
    const html = `
      <article>
        <h1>BUG #123 登录失败</h1>
        <script>console.log("bad js block")</script>
        <style>body { background: red; }</style>
        <noscript>Turn on JS</noscript>
        <div hidden>Hidden content</div>
        <p style="display: none">More hidden</p>
        <p>复现步骤：点击保存按钮后出现 500。</p>
      </article>
    `

    const capture = await extractPageCapture({
      html,
      baseUrl: "https://zentao.local/bug-view-123.html",
      title: "BUG #123"
    })

    expect(capture.markdown).not.toContain("bad js block")
    expect(capture.markdown).not.toContain("background: red")
    expect(capture.markdown).not.toContain("Turn on JS")
    expect(capture.markdown).not.toContain("Hidden content")
    expect(capture.markdown).not.toContain("More hidden")
    expect(capture.markdown).toContain("复现步骤")
  })
})
