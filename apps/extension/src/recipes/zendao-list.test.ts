import { describe, expect, it } from "vitest"
import { collectZentaoBugLinks } from "./zendao-list"

describe("collectZentaoBugLinks", () => {
  it("prefers checked bug rows for batch processing", () => {
    const html = `
      <table>
        <tr data-id="101"><td><input type="checkbox" checked /></td><td><a href="/bug-view-101.html">BUG 101</a></td></tr>
        <tr data-id="102"><td><input type="checkbox" /></td><td><a href="/bug-view-102.html">BUG 102</a></td></tr>
      </table>
    `

    const result = collectZentaoBugLinks({
      url: "https://zentao.local/bug-browse-1.html",
      html,
      baseUrl: "https://zentao.local/bug-browse-1.html"
    })
    expect(result).toEqual(["https://zentao.local/bug-view-101.html"])
  })
})
