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
})
