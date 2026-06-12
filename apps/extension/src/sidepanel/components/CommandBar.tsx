import React from "react"
import type { ChatCommand } from "@chandaoplus/shared"

interface CommandBarProps {
  command: ChatCommand
  onChange: (command: ChatCommand) => void
  customCommands?: Array<{ command: ChatCommand; label: string; prompt: string }>
  onCustomClick?: (prompt: string, command: ChatCommand) => void
}

export function CommandBar({ command, onChange, customCommands = [], onCustomClick }: CommandBarProps) {
  const defaults = [
    { type: "estimate" as const, label: "评估" }
  ]

  return (
    <div className="command-bar">
      <div className="command-chips">
        {defaults.map((item) => (
          <button
            key={item.type}
            type="button"
            className={`chip ${command === item.type ? "active" : ""}`}
            onClick={() => onChange(item.type)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {customCommands.length > 0 && onCustomClick && (
        <div className="custom-commands">
          <label>快速操作:</label>
          <div className="custom-chips">
            {customCommands.map((item, index) => (
              <button
                key={index}
                type="button"
                className="chip chip-custom"
                onClick={() => onCustomClick(item.prompt, item.command)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
