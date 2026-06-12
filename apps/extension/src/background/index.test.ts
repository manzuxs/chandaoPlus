import { describe, expect, it, vi } from "vitest"
import { runChatFromActiveTab } from "./index"

describe("runChatFromActiveTab", () => {
  it("captures the current page and forwards it to the gateway", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      url: "https://zentao.local/bug-view-1.html",
      title: "BUG #1",
      markdown: "# BUG #1",
      images: [],
      metadata: {}
    })
    const startStream = vi.fn().mockResolvedValue(undefined)

    await runChatFromActiveTab({
      chromeApi: {
        tabs: {
          query: vi.fn().mockResolvedValue([{ id: 1 }]),
          sendMessage
        },
        sidePanel: {}
      } as any,
      gatewayClient: { startStream } as any,
      workspaceId: "project-a",
      agent: "claude-code",
      command: "estimate",
      message: "评估"
    })

    expect(sendMessage).toHaveBeenCalled()
    expect(startStream).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "project-a",
        agent: "claude-code",
        command: "estimate"
      })
    )
  })
})
