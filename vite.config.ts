/**
 * 渲染进程的构建配置。
 *
 * 根目录设为 `src/ui`——渲染进程只该看见 UI 那一层的文件。
 * `base: "./"` 使产物用相对路径，`file://` 加载才不会 404。
 */
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  root: "src/ui",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
  },
  server: { port: 5273, strictPort: true },
})
