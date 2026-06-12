import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { App } from "./App"

describe("App", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/workspaces")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    })

    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("requires workspace selection before sending", async () => {
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByText("评估工期与修复方案"))
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("请评估这个问题的修复工期、风险和建议方案。")

    await waitFor(() => {
      expect(screen.getByText(/选择工作空间/i)).toBeTruthy()
    })
  })

  it("filters command list dynamically when query changes", async () => {
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "/" } })
    
    expect(screen.getByText("快捷技能 (点击选择)")).toBeTruthy()
    expect(screen.getAllByText("评估工期与修复方案").length).toBe(2)
    expect(screen.queryByText("获取修复建议")).toBeNull()
    expect(screen.queryByText("自由对话问答")).toBeNull()

    fireEvent.change(textarea, { target: { value: "/est" } })
    expect(screen.getAllByText("评估工期与修复方案").length).toBe(2)

    fireEvent.change(textarea, { target: { value: "/rep" } })
    expect(screen.queryByText("快捷技能 (点击选择)")).toBeNull()
    expect(screen.queryByText("/estimate")).toBeNull()
  })
})
