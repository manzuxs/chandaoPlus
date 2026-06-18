export function isZentaoBugListUrl(url: string): boolean {
  if (/bug-browse-/i.test(url)) return true

  try {
    const parsed = new URL(url)
    const openParam = parsed.searchParams.get("open")
    if (openParam) {
      try {
        const decoded = atob(decodeURIComponent(openParam))
        const absoluteDecoded = decoded.startsWith("http") ? decoded : new URL(decoded, parsed.origin).toString()
        if (isZentaoBugListUrl(absoluteDecoded)) return true
      } catch {
        const decodedParam = decodeURIComponent(openParam)
        if (/bug-browse-/i.test(decodedParam) || (decodedParam.includes("m=bug") && decodedParam.includes("f=browse"))) return true
      }
    }
    return parsed.searchParams.get("m") === "bug" && parsed.searchParams.get("f") === "browse"
  } catch {
    return false
  }
}

type CollectZentaoBugInput = {
  url: string
  html: string
  baseUrl: string
  liveDocument?: Document
}

type ZentaoBugItem = {
  id: string
  url: string
}

type RowSource = {
  rowId?: string
  root?: Element
  cells: Element[]
}

function parseHtmlToDocument(html: string): Document {
  if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
    const parser = new window.DOMParser()
    return parser.parseFromString(html, "text/html")
  }

  // Fallback if needed, but in our jsdom test environment DOMParser is available globally
  // @ts-ignore
  const parser = new DOMParser()
  return parser.parseFromString(html, "text/html")
}

function resolveZentaoListBaseUrl(input: { url: string; baseUrl: string }): string {
  let realBaseUrl = input.baseUrl
  try {
    const parsed = new URL(input.url)
    const openParam = parsed.searchParams.get("open")
    if (openParam) {
      const decoded = atob(decodeURIComponent(openParam))
      realBaseUrl = decoded.startsWith("http") ? decoded : new URL(decoded, parsed.origin).toString()
    }
  } catch {}
  return realBaseUrl
}

function isBugDetailReference(value: string): boolean {
  return /bug-view/i.test(value) || (value.includes("f=view") && (value.includes("m=bug") || value.includes("bugID") || value.includes("bugId")))
}

function extractBugIdFromReference(value: string): string {
  try {
    const parsed = new URL(value, "https://zentao.local")
    return parsed.searchParams.get("bugID") || parsed.searchParams.get("bugId") || parsed.searchParams.get("id") || ""
  } catch {}

  const match = value.match(/bug-view-(\d+)/i) || value.match(/[?&](?:bugID|bugId|id)=(\d+)/i)
  return match?.[1] || ""
}

function buildBugDetailUrl(baseUrl: string, bugId: string): string {
  if (!bugId) return ""

  try {
    if (/bug-browse-[^/?#]+/i.test(baseUrl)) {
      return baseUrl.replace(/bug-browse-[^/?#]+/i, `bug-view-${bugId}.html`)
    }

    const parsed = new URL(baseUrl)
    parsed.searchParams.set("m", "bug")
    parsed.searchParams.set("f", "view")
    parsed.searchParams.set("bugID", bugId)
    parsed.searchParams.delete("id")
    return parsed.toString()
  } catch {
    return ""
  }
}

function resolveReferenceUrl(reference: string, baseUrl: string): string {
  try {
    return new URL(reference, baseUrl).toString()
  } catch {
    return reference
  }
}

function getRowBugId(row: Element): string {
  const attributeNames = [
    "data-id",
    "data-bug-id",
    "data-bugid",
    "bugid",
    "bug-id"
  ]

  for (const name of attributeNames) {
    const value = row.getAttribute(name)
    if (value && /^\d+$/.test(value.trim())) {
      return value.trim()
    }
  }

  for (const value of Object.values((row as HTMLElement).dataset || {})) {
    if (value && /^\d+$/.test(value.trim())) {
      return value.trim()
    }
  }

  return ""
}

function getRowBugUrlFromElements(elements: Element[], fallbackRowId: string | undefined, baseUrl: string): string {
  const candidateElements = [
    ...elements,
    ...elements.flatMap((element) => Array.from(element.querySelectorAll("[href], [data-url], [data-href], [data-link], [data-row-url]")))
  ]

  for (const element of candidateElements) {
    const references = [
      element.getAttribute("href"),
      element.getAttribute("data-url"),
      element.getAttribute("data-href"),
      element.getAttribute("data-link"),
      element.getAttribute("data-row-url")
    ].filter((value): value is string => Boolean(value))

    for (const reference of references) {
      if (isBugDetailReference(reference)) {
        return resolveReferenceUrl(reference, baseUrl)
      }

      const bugId = extractBugIdFromReference(reference)
      if (bugId) {
        return resolveReferenceUrl(reference, baseUrl) || buildBugDetailUrl(baseUrl, bugId)
      }
    }
  }

  return buildBugDetailUrl(baseUrl, fallbackRowId || "")
}

function getRowBugUrl(row: Element, baseUrl: string): string {
  const candidateElements = [
    row,
    ...Array.from(row.querySelectorAll("[href], [data-url], [data-href], [data-link], [data-row-url]"))
  ]

  for (const element of candidateElements) {
    const references = [
      element.getAttribute("href"),
      element.getAttribute("data-url"),
      element.getAttribute("data-href"),
      element.getAttribute("data-link"),
      element.getAttribute("data-row-url")
    ].filter((value): value is string => Boolean(value))

    for (const reference of references) {
      if (isBugDetailReference(reference)) {
        return resolveReferenceUrl(reference, baseUrl)
      }

      const bugId = extractBugIdFromReference(reference)
      if (bugId) {
        return resolveReferenceUrl(reference, baseUrl) || buildBugDetailUrl(baseUrl, bugId)
      }
    }
  }

  return buildBugDetailUrl(baseUrl, getRowBugId(row))
}

function isTruthyState(value: string | null): boolean {
  if (value == null) return false
  const normalized = value.trim().toLowerCase()
  return normalized === "" || (normalized !== "false" && normalized !== "0" && normalized !== "off" && normalized !== "no")
}

function elementLooksChecked(element: Element): boolean {
  const classList = element.classList
  if (
    classList.contains("checked") ||
    classList.contains("is-checked") ||
    classList.contains("selected") ||
    classList.contains("is-selected")
  ) {
    return true
  }

  return (
    isTruthyState(element.getAttribute("aria-checked")) ||
    isTruthyState(element.getAttribute("aria-selected")) ||
    isTruthyState(element.getAttribute("data-checked")) ||
    isTruthyState(element.getAttribute("data-selected"))
  )
}

function isRowChecked(row: Element): boolean {
  const checkboxes = Array.from(row.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[]
  if (checkboxes.some((checkbox) => checkbox.checked || checkbox.getAttribute("checked") !== null)) {
    return true
  }

  if (elementLooksChecked(row)) return true

  return Array.from(row.querySelectorAll("*")).some((element) => elementLooksChecked(element))
}

function isValidDtableRowId(value: string | null): value is string {
  return Boolean(value) && value !== "HEADER"
}

function collectRowSources(doc: Document): RowSource[] {
  const dtableCells = Array.from(doc.querySelectorAll(".dtable-cell[data-row]"))
  if (dtableCells.length > 0) {
    const grouped = new Map<string, Element[]>()

    for (const cell of dtableCells) {
      const rowId = cell.getAttribute("data-row")
      if (!isValidDtableRowId(rowId)) continue
      const bucket = grouped.get(rowId) || []
      bucket.push(cell)
      grouped.set(rowId, bucket)
    }

    if (grouped.size > 0) {
      return Array.from(grouped.entries()).map(([rowId, cells]) => ({ rowId, cells }))
    }
  }

  return Array.from(doc.querySelectorAll("tr, .dtable-row, [data-row]")).map((row) => ({
    rowId: getRowBugId(row),
    root: row,
    cells: [row]
  }))
}

function isSourceChecked(source: RowSource): boolean {
  if (source.root) {
    return isRowChecked(source.root)
  }

  // flat cell 模式：也检查 cells 的父级 .dtable-row 上的勾选状态，
  // 因为某些禅道版本只在 row 元素上标记 is-checked 而不在 cell 上
  for (const cell of source.cells) {
    const parentRow = cell.closest(".dtable-row")
    if (parentRow && elementLooksChecked(parentRow)) {
      return true
    }
  }

  const allElements = source.cells.flatMap((cell) => [cell, ...Array.from(cell.querySelectorAll("*"))])
  const checkboxes = allElements
    .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && element.type === "checkbox")

  if (checkboxes.some((checkbox) => checkbox.checked || checkbox.getAttribute("checked") !== null)) {
    return true
  }

  return allElements.some((element) => elementLooksChecked(element))
}

function getSourceBugUrl(source: RowSource, baseUrl: string): string {
  if (source.root) {
    return getRowBugUrl(source.root, baseUrl)
  }

  return getRowBugUrlFromElements(source.cells, source.rowId, baseUrl)
}

function collectBugRows(input: CollectZentaoBugInput): { checkedLinks: string[]; allLinks: string[]; hasCheckedRows: boolean } {
  if (!isZentaoBugListUrl(input.url)) {
    return { checkedLinks: [], allLinks: [], hasCheckedRows: false }
  }

  const realBaseUrl = resolveZentaoListBaseUrl(input)
  const doc = input.liveDocument ?? parseHtmlToDocument(input.html)

  const rows = collectRowSources(doc)
  const checkedLinks: string[] = []
  const allLinks: string[] = []
  let hasCheckedRows = false

  for (const row of rows) {
    const absoluteUrl = getSourceBugUrl(row, realBaseUrl)
    const isChecked = isSourceChecked(row)
    if (isChecked) hasCheckedRows = true
    if (!absoluteUrl) continue

    if (isChecked) {
      checkedLinks.push(absoluteUrl)
    }
    allLinks.push(absoluteUrl)
  }

  return { checkedLinks, allLinks, hasCheckedRows }
}

export function collectZentaoBugLinks(input: CollectZentaoBugInput): string[] {
  const { checkedLinks, allLinks } = collectBugRows(input)

  const links = checkedLinks.length > 0 ? checkedLinks : allLinks
  return links.slice(0, 20)
}

export function collectZentaoBugListStatus(input: CollectZentaoBugInput): { items: ZentaoBugItem[]; isAnyChecked: boolean } {
  const { checkedLinks, allLinks, hasCheckedRows } = collectBugRows(input)
  const links = (checkedLinks.length > 0 ? checkedLinks : allLinks).slice(0, 20)
  const items = links
    .map((link) => ({ id: extractBugIdFromReference(link), url: link }))
    .filter((item) => Boolean(item.id))

  return { items, isAnyChecked: hasCheckedRows }
}
