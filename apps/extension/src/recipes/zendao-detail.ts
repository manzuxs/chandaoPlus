export function detectZentaoBugDetail(input: { url: string; html: string }) {
  if (!/bug-view-\d+/.test(input.url)) return null
  const bugId = input.url.match(/bug-view-(\d+)/)?.[1] ?? ""
  
  const titleMatch = input.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const title = titleMatch ? titleMatch[1].trim() : ""
  
  const statusMatch = input.html.match(/class=["']status["'][^>]*>([\s\S]*?)<\/span>/)
  const status = statusMatch ? statusMatch[1].trim() : ""
  
  const assignedToMatch = input.html.match(/class=["']assignedTo["'][^>]*>([\s\S]*?)<\/span>/)
  const assignedTo = assignedToMatch ? assignedToMatch[1].trim() : ""

  return {
    metadata: {
      pageKind: "zentao-bug-detail",
      bugId,
      title,
      status,
      assignedTo
    }
  }
}
