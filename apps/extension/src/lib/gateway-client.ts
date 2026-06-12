import type { ChatRequest, ChatStreamChunk } from "@chandaoplus/shared"

export class GatewayClient {
  constructor(private readonly baseUrl: string = "http://127.0.0.1:3210") {}

  async startStream(
    request: ChatRequest,
    onChunk?: (chunk: ChatStreamChunk) => void
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Gateway error" }))
      throw new Error(err.error || `HTTP ${response.status}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (reader) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith("data: ")) {
          try {
            const chunk = JSON.parse(trimmed.slice(6)) as ChatStreamChunk
            if (onChunk) {
              onChunk(chunk)
            }
          } catch {
            // Ignore partial SSE chunk parses
          }
        }
      }
    }
  }
}

export const gatewayClient = new GatewayClient()
