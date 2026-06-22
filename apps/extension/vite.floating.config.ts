import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

/**
 * 独立构建配置：将悬浮聊天窗口打包为单一自包含 JS 文件。
 * 包含 React、marked 等所有依赖，不参与主 build 的 code splitting，
 * 确保通过 chrome.runtime.getURL 动态 import 时不依赖外部 chunk。
 */
export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  build: {
    outDir: "dist",
    emptyOutDir: false, // 不清空 dist，叠加到主 build 输出上
    minify: true, // 启用压缩
    lib: {
      entry: resolve(__dirname, "src/content/floating-entry.tsx"),
      formats: ["es"],
      fileName: () => "src/content/floating.js"
    },
    rollupOptions: {
      external: ["jsdom"]
    }
  }
})
