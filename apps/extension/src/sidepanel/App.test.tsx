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
      if (url.includes("/api/chat/models")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    
    // 欢迎页中的快捷技能卡片
    await screen.findByText("评估工期与修复方案")

    expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(true)
    
    // 点击选择该技能
    fireEvent.click(screen.getByText("评估工期与修复方案"))
    
    // 现在选中技能不会填充文本框，值应保持为空
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("")
    
    // 但输入框上方应当成功渲染出当前选中的技能标签
    const badge = document.querySelector(".input-skill-badge")
    expect(badge).toBeTruthy()
    expect(badge?.querySelector(".skill-badge-name")?.textContent).toBe("评估工期与修复方案")

    // 测试取消使用该技能
    const closeBtn = screen.getByRole("button", { name: "取消技能" })
    fireEvent.click(closeBtn)
    
    // 取消后，标签应该从页面上消失
    expect(document.querySelector(".input-skill-badge")).toBeNull()

    await waitFor(() => {
      expect(screen.getByText(/选择工作空间/i)).toBeTruthy()
    })
  })

  it("filters command list dynamically when query changes", async () => {
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))

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
    expect(copiedText).toContain("<page_context>")
    expect(copiedText).toContain("<url>https://zentao.local/bug-view-1.html</url>")
    expect(copiedText).toContain("<title>BUG #1</title>")
    expect(copiedText).toContain("<bugId>1</bugId>")
    expect(copiedText).toContain("<filename>image-1.png</filename>")
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
      if (url.includes("/api/chat/models")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
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

  it("supports switching sessions during active streaming without crosstalk", async () => {
    let controllerA: ReadableStreamDefaultController | null = null
    const streamA = new ReadableStream({
      start(c) {
        controllerA = c
      }
    })

    let controllerB: ReadableStreamDefaultController | null = null
    const streamB = new ReadableStream({
      start(c) {
        controllerB = c
      }
    })

    let sessionList = [
      {
        id: "session-A",
        workspaceId: "ws-1",
        title: "会话 A",
        messageCount: 2,
        lastMessage: "A-part2",
        createdAt: "2026-06-15T03:00:00Z",
        updatedAt: "2026-06-15T03:00:00Z"
      },
      {
        id: "session-B",
        workspaceId: "ws-1",
        title: "会话 B",
        messageCount: 2,
        lastMessage: "B-part1",
        createdAt: "2026-06-15T03:01:00Z",
        updatedAt: "2026-06-15T03:01:00Z"
      }
    ]

    let streamCallCount = 0

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
              name: "评估工期",
              icon: "⏱️",
              description: "评估",
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
      if (url.includes("/api/sessions/session-A")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: "session-A",
            workspaceId: "ws-1",
            messages: [
              { role: "user", content: "Query A" },
              { role: "assistant", content: "A-part1A-part2" }
            ]
          })
        })
      }
      if (url.includes("/api/sessions/session-B")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: "session-B",
            workspaceId: "ws-1",
            messages: [
              { role: "user", content: "Query B" },
              { role: "assistant", content: "B-part1" }
            ]
          })
        })
      }
      if (url.includes("/api/chat/stream")) {
        streamCallCount++
        if (streamCallCount === 1) {
          return Promise.resolve({
            ok: true,
            body: streamA
          })
        } else {
          return Promise.resolve({
            ok: true,
            body: streamB
          })
        }
      }
      if (url.includes("/api/chat/models")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    })

    vi.stubGlobal("fetch", customFetchMock)

    const storageGetMock = vi.fn().mockImplementation((keys: any, callback?: any) => {
      const result: Record<string, any> = { lastWorkspaceId: "ws-1" }
      if (typeof callback === "function") {
        callback(result)
      }
      return Promise.resolve(result)
    })

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn().mockImplementation((message: { type: string }, callback: (response: any) => void) => {
          if (message.type === "CAPTURE_ACTIVE_TAB") {
            callback({
              url: "https://zentao.local/bug-view-1.html",
              title: "BUG #1",
              markdown: "# BUG #1\n\n页面白屏",
              images: [],
              metadata: {
                pageKind: "zentao-bug-detail",
                bugId: "1"
              }
            })
          }
        }),
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

    // 1. 等待工作空间渲染
    await screen.findByText("工作空间一")

    // 2. 发送 Session A 消息 (Query A)
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "Query A" } })
    const sendBtn = screen.getByRole("button", { name: "发送" })
    fireEvent.click(sendBtn)

    // 3. 模拟 Stream A 返回 meta（包含 id）与部分字符
    const encoder = new TextEncoder()
    expect(controllerA).toBeTruthy()
    controllerA!.enqueue(encoder.encode('data: {"type": "meta", "sessionId": "session-A"}\n'))
    controllerA!.enqueue(encoder.encode('data: {"type": "text", "content": "A-part1"}\n'))

    // 4. 等待 A-part1 渲染
    await screen.findByText("A-part1")

    // 5. 在 Stream A 依然开启的情况下，模拟切换到“新建会话”（temp）
    const historyBtn = screen.getByRole("button", { name: "历史会话" })
    fireEvent.click(historyBtn)
    await screen.findByText("+ 新建会话")
    const newSessionBtn = screen.getByRole("button", { name: "+ 新建会话" })
    fireEvent.click(newSessionBtn)

    // 确认切回空界面
    await waitFor(() => {
      expect(screen.queryByText("A-part1")).toBeNull()
    })

    // 6. 在新建会话发送 Session B 消息 (Query B)
    fireEvent.change(textarea, { target: { value: "Query B" } })
    fireEvent.click(sendBtn)

    // 7. 模拟 Stream B 返回 meta 类似与内容
    expect(controllerB).toBeTruthy()
    controllerB!.enqueue(encoder.encode('data: {"type": "meta", "sessionId": "session-B"}\n'))
    controllerB!.enqueue(encoder.encode('data: {"type": "text", "content": "B-part1"}\n'))

    // 8. 等待 B-part1 渲染
    await screen.findByText("B-part1")
    expect(screen.queryByText("A-part1")).toBeNull() // 确无交叉串线

    // 9. 此时，在后台向 Stream A 写入后续数据并关闭它，同时关闭 Stream B
    controllerA!.enqueue(encoder.encode('data: {"type": "text", "content": "A-part2"}\n'))
    controllerA!.close()
    controllerB!.close()

    // 10. 切换回 Session A
    fireEvent.click(historyBtn)
    // 渲染历史会话列表，点击“会话 A”
    const sessionAItem = await screen.findByText("会话 A")
    fireEvent.click(sessionAItem)

    // 11. 验证 Session A 中后台追加的内容已成功合并，完整呈现在 UI 上
    await screen.findByText("A-part1A-part2")
    expect(screen.queryByText("B-part1")).toBeNull()
  })

  it("keeps a follow-up user message when stream meta repeats the current session id", async () => {
    let controller: ReadableStreamDefaultController | null = null
    const stream = new ReadableStream({
      start(c) {
        controller = c
      }
    })

    const customFetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/workspaces")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: "ws-1", label: "工作空间一", rootPath: "/ws-1" }])
        })
      }
      if (url.includes("/api/skills")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      if (url.includes("/api/sessions?workspaceId=")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: "session-1",
              workspaceId: "ws-1",
              title: "已有会话",
              messageCount: 2,
              lastMessage: "旧回复",
              createdAt: "2026-06-15T03:00:00Z",
              updatedAt: "2026-06-15T03:00:00Z"
            }
          ])
        })
      }
      if (url.includes("/api/sessions/session-1")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: "session-1",
            workspaceId: "ws-1",
            messages: [
              { role: "user", content: "旧问题" },
              { role: "assistant", content: "旧回复" }
            ]
          })
        })
      }
      if (url.includes("/api/chat/stream")) {
        return Promise.resolve({
          ok: true,
          body: stream
        })
      }
      if (url.includes("/api/chat/models")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
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
      if (keys === "session_ws-1") {
        result["session_ws-1"] = "session-1"
      }
      if (typeof callback === "function") {
        callback(result)
      }
      return Promise.resolve(result)
    })

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn().mockImplementation((message: { type: string }, callback: (response: any) => void) => {
          if (message.type === "CAPTURE_ACTIVE_TAB") {
            callback({
              url: "https://zentao.local/bug-view-1.html",
              title: "BUG #1",
              markdown: "# BUG #1\n\n页面白屏",
              images: [],
              metadata: {}
            })
          }
        }),
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

    await screen.findByText("旧回复")

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "开始修复" } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await screen.findByText("开始修复")

    const encoder = new TextEncoder()
    expect(controller).toBeTruthy()
    controller!.enqueue(encoder.encode('data: {"type": "meta", "sessionId": "session-1"}\n'))
    controller!.enqueue(encoder.encode('data: {"type": "text", "content": "继续输出"}\n'))
    controller!.close()

    await screen.findByText("继续输出")
    expect(screen.getByText("开始修复")).toBeTruthy()
  })

  it("renders effort values dynamically through a single-level card", async () => {
    render(<App />)
    
    // 等待初始化完成，默认会渲染成触发器文字 "推理：中"
    await screen.findByText("推理：中")
    
    // 打开卡片菜单
    const modelSelector = screen.getByTitle("思考强度")
    fireEvent.click(modelSelector)
    
    // 卡片打开，里面应该渲染有推理的四个选项
    expect(screen.getByText("推理")).toBeTruthy()
    const reasoningSection = document.querySelector(".reasoning-section")
    expect(reasoningSection).toBeTruthy()
    expect(reasoningSection?.textContent).toContain("低")
    expect(reasoningSection?.textContent).toContain("中")
    expect(reasoningSection?.textContent).toContain("高")
    expect(reasoningSection?.textContent).toContain("超高")
    
    // 点击 "超高" 选项以更改思考强度
    fireEvent.click(screen.getByText("超高"))
    
    // 触发器应该更新为 "推理：超高"
    await screen.findByText("推理：超高")
  })
})
