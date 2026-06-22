import { describe, expect, it } from "vitest"
import { collectZentaoBugLinks, collectZentaoBugListStatus, isZentaoBugListUrl } from "./zendao-list"

describe("isZentaoBugListUrl", () => {
  it("matches pathinfo style bug browse URLs", () => {
    expect(isZentaoBugListUrl("https://zentao.local/bug-browse-1.html")).toBe(true)
  })

  it("matches GET parameter style bug browse URLs", () => {
    expect(isZentaoBugListUrl("https://cd.shushangyun.com/index.php?m=bug&f=browse&product=78")).toBe(true)
  })

  it("does not match unrelated URLs", () => {
    expect(isZentaoBugListUrl("https://zentao.local/bug-view-101.html")).toBe(false)
    expect(isZentaoBugListUrl("https://cd.shushangyun.com/index.php?m=bug&f=view&id=101")).toBe(false)
  })
})

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
    expect(result).toEqual(["https://zentao.local/bug-view-101.html?onlybody=yes"])
  })

  it("works correctly under GET query parameters style", () => {
    const html = `
      <table>
        <tr data-id="101"><td><input type="checkbox" checked /></td><td><a href="index.php?m=bug&f=view&bugID=101">BUG 101</a></td></tr>
      </table>
    `
    const result = collectZentaoBugLinks({
      url: "https://cd.shushangyun.com/index.php?m=bug&f=browse&product=78",
      html,
      baseUrl: "https://cd.shushangyun.com/index.php?m=bug&f=browse&product=78"
    })
    expect(result).toEqual(["https://cd.shushangyun.com/index.php?m=bug&f=view&bugID=101&onlybody=yes"])
  })

  it("prefers live DOM checkbox state even when outerHTML is stale", () => {
    const html = `
      <table>
        <tr data-id="101"><td><input type="checkbox" /></td><td><a href="/bug-view-101.html">BUG 101</a></td></tr>
        <tr data-id="102"><td><input type="checkbox" /></td><td><a href="/bug-view-102.html">BUG 102</a></td></tr>
      </table>
    `

    const doc = new DOMParser().parseFromString(html, "text/html")
    const checkboxes = Array.from(doc.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[]
    checkboxes[1].checked = true

    const result = collectZentaoBugLinks({
      url: "https://zentao.local/bug-browse-1.html",
      html,
      baseUrl: "https://zentao.local/bug-browse-1.html",
      liveDocument: doc
    })

    expect(result).toEqual(["https://zentao.local/bug-view-102.html?onlybody=yes"])
  })
})

describe("collectZentaoBugListStatus", () => {
  it("detects selected rows from aria state and data-url fields", () => {
    const html = `
      <div class="dtable-row" data-row data-id="10771" aria-selected="true" data-url="/index.php?m=bug&f=view&bugID=10771">
        <div class="checkbox-primary"></div>
      </div>
      <div class="dtable-row" data-row data-id="10765" data-url="/index.php?m=bug&f=view&bugID=10765"></div>
    `

    const result = collectZentaoBugListStatus({
      url: "https://cd.shushangyun.com/index.php?m=bug&f=browse&product=78",
      html,
      baseUrl: "https://cd.shushangyun.com/index.php?m=bug&f=browse&product=78"
    })

    expect(result).toEqual({
      items: [{ id: "10771", url: "https://cd.shushangyun.com/index.php?m=bug&f=view&bugID=10771&onlybody=yes", title: "BUG #10771" }],
      isAnyChecked: true
    })
  })

  it("detects selected bugs from flat dtable cells grouped by data-row", () => {
    const html = `
      <div id="bugs" class="dtable">
        <div class="dtable-cell dtable-header-cell has-checkbox" data-col="id" data-row="HEADER" data-type="checkID">
          <div class="dtable-checkbox checkbox-primary checked"><input type="checkbox"><label></label></div>
        </div>
        <div class="dtable-cell is-first-in-row has-checkbox is-checked" data-col="id" data-row="10771" data-type="checkID">
          <div class="dtable-cell-content">10771<div class="dtable-checkbox checkbox-primary checked"><input type="checkbox"><label></label></div></div>
        </div>
        <div class="dtable-cell is-last-in-row is-checked" data-col="title" data-row="10771" data-type="title">
          <div class="dtable-cell-content"><a href="/index.php?m=bug&f=view&bugID=10771">BUG 10771</a></div>
        </div>
        <div class="dtable-cell has-checkbox" data-col="id" data-row="10765" data-type="checkID">
          <div class="dtable-cell-content">10765<div class="dtable-checkbox checkbox-primary"><input type="checkbox"><label></label></div></div>
        </div>
        <div class="dtable-cell" data-col="title" data-row="10765" data-type="title">
          <div class="dtable-cell-content"><a href="/index.php?m=bug&f=view&bugID=10765">BUG 10765</a></div>
        </div>
      </div>
    `

    const result = collectZentaoBugListStatus({
      url: "https://cd.shushangyun.com/index.php?m=bug&f=browse&product=78",
      html,
      baseUrl: "https://cd.shushangyun.com/index.php?m=bug&f=browse&product=78"
    })

    expect(result).toEqual({
      items: [{ id: "10771", url: "https://cd.shushangyun.com/index.php?m=bug&f=view&bugID=10771&onlybody=yes", title: "BUG 10771" }],
      isAnyChecked: true
    })
  })
})
