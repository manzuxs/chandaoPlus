import { useState, useEffect } from "react"
import type { ChatCommand } from "@chandaoplus/shared"

export interface CustomCommand {
  command: ChatCommand
  label: string
  prompt: string
}

export function useZentaoCommands() {
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>([])

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url || ""
        if (/bug-view-(\d+)/.test(url)) {
          const bugId = url.match(/bug-view-(\d+)/)?.[1] || ""
          setCustomCommands([
            {
              command: "estimate",
              label: `评估 BUG #${bugId}`,
              prompt: `请评估 BUG #${bugId} 的修复工期、风险和建议方案。`
            }
          ])
        } else if (/bug-browse-/.test(url)) {
          setCustomCommands([
            {
              command: "estimate",
              label: "批量评估选中 BUG",
              prompt: "请对列表中选中的所有 BUG 进行批量评估，分别输出工期和修复建议。"
            }
          ])
        }
      })
    }
  }, [])

  return customCommands
}
export default useZentaoCommands
