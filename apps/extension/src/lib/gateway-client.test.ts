import { describe, expect, it, vi, afterEach } from "vitest"
import { GatewayClient } from "./gateway-client"

describe("GatewayClient", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("handles successful SSE streaming responses", async () => {
    const chunks = [
      'data: {"type":"text","content":"Hello"}\n',
      'data: {"type":"text","content":" World"}\n'
    ]

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
        controller.close()
      }
    })

    const mockResponse = {
      ok: true,
      body: stream
    }

    const fetchMock = vi.fn().mockResolvedValue(mockResponse)
    vi.stubGlobal("fetch", fetchMock)

    const client = new GatewayClient("http://localhost:3210")
    const received: string[] = []

    await client.startStream(
      {
        workspaceId: "test-ws",
        agent: "claude-code",
        command: "estimate",
        page: { url: "http://test", title: "Test", markdown: "# Test", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hi" }]
      },
      (chunk) => {
        if (chunk.type === "text") {
          received.push(chunk.content)
        }
      }
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3210/api/chat/stream",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
    )
    expect(received).toEqual(["Hello", " World"])
  })

  it("throws error when fetch response is not ok", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Internal Gateway Error" })
    }

    const fetchMock = vi.fn().mockResolvedValue(mockResponse)
    vi.stubGlobal("fetch", fetchMock)

    const client = new GatewayClient("http://localhost:3210")

    await expect(
      client.startStream({
        workspaceId: "test-ws",
        agent: "claude-code",
        command: "estimate",
        page: { url: "http://test", title: "Test", markdown: "# Test", images: [], metadata: {} },
        messages: [{ role: "user", content: "Hi" }]
      })
    ).rejects.toThrow("Internal Gateway Error")
  })
})
