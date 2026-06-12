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

  it("prefers live DOM capture when scripting returns ZenTao bug detail", async () => {
    const sendMessage = vi.fn()
    const executeScript = vi.fn().mockResolvedValue([
      {
        result: null
      },
      {
        result: {
          url: "https://zentao.example.com/index.php?m=bug&f=view&bugID=10765",
          title: "BUG #10765",
          markdown: "## 重现步骤\n\n部分字段没有翻译\n\n## 历史记录\n\n交易说明填写信息无需国际化",
          images: [],
          metadata: {
            pageKind: "zentao-bug-detail",
            captureSource: "live-dom",
            bugId: "10765"
          }
        }
      }
    ])
    const startStream = vi.fn().mockResolvedValue(undefined)

    await runChatFromActiveTab({
      chromeApi: {
        tabs: {
          query: vi.fn().mockResolvedValue([{ id: 1 }]),
          sendMessage
        },
        scripting: {
          executeScript
        },
        sidePanel: {}
      } as any,
      gatewayClient: { startStream } as any,
      workspaceId: "project-a",
      agent: "claude-code",
      command: "estimate",
      message: "评估"
    })

    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 1, allFrames: true }
      })
    )
    expect(sendMessage).not.toHaveBeenCalled()
    expect(startStream).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          markdown: expect.stringContaining("历史记录"),
          metadata: expect.objectContaining({
            captureSource: "live-dom"
          })
        })
      })
    )
  })
})
