import { describe, expect, it } from "vitest"
import { detectZentaoBugDetail } from "./zendao-detail"

describe("detectZentaoBugDetail", () => {
  it("extracts bug detail metadata", () => {
    const html = `
      <div id="mainContent">
        <h1>BUG #123 登录失败</h1>
        <span class="status">激活</span>
        <span class="assignedTo">王五</span>
      </div>
    `
    const result = detectZentaoBugDetail({
      url: "https://zentao.local/bug-view-123.html",
      html
    })

    expect(result?.metadata.pageKind).toBe("zentao-bug-detail")
    expect(result?.metadata.bugId).toBe("123")
  })
})
