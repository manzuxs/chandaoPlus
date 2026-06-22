import React from "react"
import { createRoot } from "react-dom/client"
import { FloatingWidget } from "./FloatingWidget"
// @ts-ignore — Vite ?inline import
import cssText from "./floating-widget.css?inline"

let unmountFn: (() => void) | null = null

export function mountFloatingWidget() {
  if (document.getElementById("chandaoplus-floating-host")) return

  const host = document.createElement("div")
  host.id = "chandaoplus-floating-host"
  // 宿主元素不占布局空间，仅作为 Shadow DOM 的挂载点
  host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;"
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: "open" })

  // 注入样式到 Shadow DOM
  const style = document.createElement("style")
  style.textContent = cssText
  shadow.appendChild(style)

  // 创建 React 渲染容器，恢复 pointer-events
  const container = document.createElement("div")
  container.style.pointerEvents = "auto"
  shadow.appendChild(container)

  const root = createRoot(container)
  root.render(React.createElement(FloatingWidget))

  unmountFn = () => {
    root.unmount()
    host.remove()
    unmountFn = null
  }
}

export function unmountFloatingWidget() {
  unmountFn?.()
}
