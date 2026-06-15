import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { App } from "./App"

describe("App", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let writeTextMock: ReturnType<typeof vi.fn>
  let sendMessageMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/workspaces")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      if (url.includes("/api/skills")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: "estimate",
              name: "评估工期与修复方案",
              icon: "⏱️",
              description: "评估禅道 BUG 修复成本",
              keywords: ["estimate", "评估", "修复"],
              promptTemplate: "请评估这个问题的修复工期、风险和建议方案。\n输出结构化结果。",
              outputFormat: "markdown",
              builtin: true
            }
          ])
        })
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    })

    vi.stubGlobal("fetch", fetchMock)
    writeTextMock = vi.fn().mockResolvedValue(undefined)
    sendMessageMock = vi.fn().mockImplementation((message: { type: string }, callback: (response: any) => void) => {
      if (message.type === "CAPTURE_ACTIVE_TAB") {
        callback({
          url: "https://zentao.local/bug-view-1.html",
          title: "BUG #1",
          markdown: "# BUG #1\n\n页面白屏",
          images: [
            {
              filename: "image-1.png",
              alt: "错误弹窗",
              mimeType: "image/png",
              sourceUrl: "https://zentao.local/file-read-1.png",
              base64Data: "ZmFrZQ=="
            }
          ],
          metadata: {
            pageKind: "zentao-bug-detail",
            bugId: "1"
          }
        })
      }
    })

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock
      }
    })

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      },
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn()
        }
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("requires workspace selection before sending", async () => {
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await screen.findByText("评估工期与修复方案")

    expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByText("评估工期与修复方案"))
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("请评估这个问题的修复工期、风险和建议方案。")

    await waitFor(() => {
      expect(screen.getByText(/选择工作空间/i)).toBeTruthy()
    })
  })

  it("filters command list dynamically when query changes", async () => {
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await screen.findByText("评估工期与修复方案")

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "/" } })
    
    expect(screen.getByText("快捷技能")).toBeTruthy()
    expect(screen.getAllByText("评估工期与修复方案").length).toBe(2)
    expect(screen.getByText("/estimate")).toBeTruthy()
    expect(screen.queryByText("获取修复建议")).toBeNull()
    expect(screen.queryByText("自由对话问答")).toBeNull()

    fireEvent.change(textarea, { target: { value: "/est" } })
    expect(screen.getAllByText("评估工期与修复方案").length).toBe(2)

    fireEvent.change(textarea, { target: { value: "/rep" } })
    expect(screen.queryByText("快捷技能")).toBeNull()
    expect(screen.queryByText("/estimate")).toBeNull()
  })

  it("copies the extracted page preview from the header button", async () => {
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const headerActions = screen.getByRole("button", { name: "选择工作空间" }).parentElement
    const copyButton = screen.getByRole("button", { name: "复制当前网页内容" })
    const skillButton = screen.getByRole("button", { name: "管理技能" })

    expect(headerActions?.children[0]).toBe(screen.getByRole("button", { name: "选择工作空间" }))
    expect(headerActions?.children[1]).toBe(copyButton)
    expect(headerActions?.children[3]).toBe(skillButton)

    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        { type: "CAPTURE_ACTIVE_TAB" },
        expect.any(Function)
      )
      expect(writeTextMock).toHaveBeenCalledTimes(1)
    })

    const copiedText = writeTextMock.mock.calls[0]?.[0] as string
    expect(copiedText).toContain("URL: https://zentao.local/bug-view-1.html")
    expect(copiedText).toContain("标题: BUG #1")
    expect(copiedText).toContain("\"bugId\": \"1\"")
    expect(copiedText).toContain("image-1.png")
    expect(copiedText).toContain("# BUG #1")
    expect(copiedText).not.toContain("ZmFrZQ==")
  })

  it("deletes a session and updates the UI list", async () => {
    let sessionList = [
      {
        id: "session-1",
        workspaceId: "ws-1",
        title: "会话一",
        messageCount: 2,
        lastMessage: "你好",
        createdAt: "2026-06-15T03:00:00Z",
        updatedAt: "2026-06-15T03:00:00Z"
      }
    ]

    const customFetchMock = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/api/workspaces")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: "ws-1", label: "工作空间一", rootPath: "/ws-1" }])
        })
      }
      if (url.includes("/api/skills")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: "estimate",
              name: "评估工期与修复方案",
              icon: "⏱️",
              description: "评估评估",
              keywords: [],
              promptTemplate: "请评估",
              outputFormat: "markdown",
              builtin: true
            }
          ])
        })
      }
      if (url.includes("/api/sessions?workspaceId=")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sessionList)
        })
      }
      if (url.includes("/api/sessions/session-1")) {
        if (options?.method === "DELETE") {
          sessionList = []
          return Promise.resolve({
            ok: true,
            status: 204
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: "session-1",
            workspaceId: "ws-1",
            messages: [{ role: "user", content: "你好" }]
          })
        })
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    })
    
    vi.stubGlobal("fetch", customFetchMock)

    const storageGetMock = vi.fn().mockImplementation((keys: any, callback?: any) => {
      const result: Record<string, any> = {}
      if (Array.isArray(keys) && keys.includes("lastWorkspaceId")) {
        result.lastWorkspaceId = "ws-1"
      }
      if (typeof callback === "function") {
        callback(result)
      }
      return Promise.resolve(result)
    })
    
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() }
      },
      storage: {
        local: {
          get: storageGetMock,
          set: vi.fn(),
          remove: vi.fn()
        }
      }
    })

    render(<App />)
    
    // 1. 等待工作空间一加载完毕并渲染出来
    await screen.findByText("工作空间一")
    
    // 2. 打开历史抽屉
    const historyBtn = screen.getByRole("button", { name: "历史会话" })
    fireEvent.click(historyBtn)
    
    // 3. 等待会话一在抽屉中渲染
    await screen.findByText("会话一")
    
    // 4. 点击删除按钮（触发自定义二次确认弹窗）
    const deleteBtn = screen.getByRole("button", { name: "删除会话" })
    fireEvent.click(deleteBtn)
    
    // 5. 找到自定义弹窗中的“确认删除”按钮并点击
    const confirmBtn = await screen.findByRole("button", { name: "确认删除" })
    fireEvent.click(confirmBtn)
    
    // 6. 验证调用了 DELETE API
    expect(customFetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3210/api/sessions/session-1",
      expect.objectContaining({ method: "DELETE" })
    )
    
    // 7. 会话一成功被从界面移除
    await waitFor(() => {
      expect(screen.queryByText("会话一")).toBeNull()
    })
  })
})
