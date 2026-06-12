export function collectZentaoBugLinks(input: { url: string; html: string; baseUrl: string }): string[] {
  if (!/bug-browse-/.test(input.url)) return []

  let doc: Document
  if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
    const parser = new window.DOMParser()
    doc = parser.parseFromString(input.html, "text/html")
  } else {
    // Fallback if needed, but in our jsdom test environment DOMParser is available globally
    // @ts-ignore
    const parser = new DOMParser()
    doc = parser.parseFromString(input.html, "text/html")
  }

  const rows = Array.from(doc.querySelectorAll("tr"))
  const checkedLinks: string[] = []
  const allLinks: string[] = []

  for (const row of rows) {
    const linkEl = row.querySelector("a[href*='bug-view']")
    if (!linkEl) continue

    const href = linkEl.getAttribute("href") ?? ""
    let absoluteUrl = ""
    try {
      absoluteUrl = new URL(href, input.baseUrl).toString()
    } catch {
      absoluteUrl = href
    }

    const checkbox = row.querySelector("input[type='checkbox']") as HTMLInputElement | null
    if (checkbox && (checkbox.checked || checkbox.getAttribute("checked") !== null)) {
      checkedLinks.push(absoluteUrl)
    }
    allLinks.push(absoluteUrl)
  }

  const links = checkedLinks.length > 0 ? checkedLinks : allLinks
  return links.slice(0, 20)
}
