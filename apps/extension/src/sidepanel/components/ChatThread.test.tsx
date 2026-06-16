import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ChatThread } from "./ChatThread"

describe("ChatThread", () => {
  it("only shows thinking state for an empty assistant message while sending", () => {
    const messages = [
      { role: "user" as const, content: "请评估" },
      { role: "assistant" as const, content: "" },
    ]

    const { rerender } = render(<ChatThread messages={messages} sending />)
    expect(screen.getByText("思考中...")).toBeTruthy()

    rerender(<ChatThread messages={messages} sending={false} />)
    expect(screen.queryByText("思考中...")).toBeNull()
  })

  it("renders tables with double pipes, escaped pipes and code block pipes without breaking layout", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: [
          "| 文件 | 改动 |",
          "|------|------|",
          "| `evaluating/index.tsx` | `orderInfo.current?.name` → `orderInfo.current?.displayName \\|\\| orderInfo.current?.name` |",
          "| `NotEvaluatedItem/index.tsx` | data.name → data.displayName || data.name |",
          "| `App.tsx` | `import | export` |"
        ].join("\n")
      }
    ]

    const { container } = render(<ChatThread messages={messages} />)
    const tables = container.querySelectorAll("table")
    expect(tables.length).toBe(1)
    
    const rows = container.querySelectorAll("tbody tr")
    expect(rows.length).toBe(3)

    // 第一行应正确解析为两个单元格
    const firstRowCells = rows[0].querySelectorAll("td")
    expect(firstRowCells.length).toBe(2)
    expect(firstRowCells[1].textContent).toContain("orderInfo.current?.displayName || orderInfo.current?.name")

    // 第二行也解析为两个单元格
    const secondRowCells = rows[1].querySelectorAll("td")
    expect(secondRowCells.length).toBe(2)
    expect(secondRowCells[1].textContent).toContain("data.displayName || data.name")

    // 第三行由于代码块内有竖线，但不应当作为分列符，也应为两个单元格
    const thirdRowCells = rows[2].querySelectorAll("td")
    expect(thirdRowCells.length).toBe(2)
    expect(thirdRowCells[1].querySelector("code")?.textContent).toContain("import | export")
  })
})
