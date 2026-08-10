/**
 * 渲染进程的构建配置。
 *
 * 根目录设为 `src/ui`——渲染进程只该看见 UI 那一层的文件。
 * `base: "./"` 使产物用相对路径，`file://` 加载才不会 404。
 */
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"

/**
 * 内容安全策略（2026-08-10）。
 *
 * ## 它此前不存在
 *
 * ②-B 的计划里写着「本项目的 CSP 是严格的（这正是它安全的原因之一）」——
 * **那句话是错的，一条 CSP 都没有。** 是做 F5（PDF 预览）时去改 CSP 才发现的。
 * `nodeIntegration: false` / `contextIsolation: true` / `sandbox: true` 都在，
 * 唯独少了这一层。
 *
 * ## 为什么这个应用需要它
 *
 * 这个界面里跑着**两种别人写的东西**：模型的回复，以及磁盘上任意文件的内容。
 * 我们目前一处 `dangerouslySetInnerHTML` 都没有（内核的 HTML 输出按纯文本显示），
 * 所以现在没有已知的注入点。**CSP 防的正是「以后某天有人加了一个」**——
 * 它是第二道墙，不是第一道。
 *
 * ## 为什么只注进构建产物
 *
 * dev 下 Vite 要往页面里塞 inline script（HMR 前导），给它开 `'unsafe-inline'`
 * 等于把这条策略最值钱的一半送掉。而 **e2e 跑的正是构建产物**——
 * 于是「被测的」与「发出去的」是同一份严格策略，dev 的宽松不会掩盖它。
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  /**
   * **样式必须留 `'unsafe-inline'`。** 界面里有若干 `style={{…}}` 属性，
   * 而它们承载的是**数据**（树的缩进层级、占比条的宽度），不是设计决定——
   * 那些值只有运行时才知道，写不进样式表。
   */
  "style-src 'self' 'unsafe-inline'",
  // 预览用 `data:` 显示图片：字节经守卫过的后端取回，不给渲染进程 `file://`
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  /**
   * PDF 预览（F5）：渲染进程用自己已经拿到的字节造 blob，不新开一条读盘的路。
   *
   * **两条都要。** 2026-08-10 只写了 `object-src`，结果 e2e 报
   * *「Framing 'blob:…' violates … "default-src 'none'"」*——
   * **Chromium 把 PDF 的 `<embed>` 当作 framing**，它自带的阅读器是在一个
   * 子框架里打开文档的。少了 `frame-src` 的现象是：`<embed>` 在、
   * `src` 是 blob:、**里面一片白**，一个断言都不会红。
   */
  "object-src blob:",
  "frame-src blob:",
  "base-uri 'none'",
  "form-action 'none'",
  /**
   * **不写 `frame-ancestors`**：它在 `<meta>` 里会被直接忽略（Chromium 会为此
   * 打一条警告），只有 HTTP 头才作数。写一条不生效的指令等于在策略里画一堵
   * 不存在的墙——而这个应用从 `file://` 加载，本来也没人能把它嵌进去。
   */
].join("; ")

/** 把 CSP 注进构建产物的 `<head>`。**只在 build**，理由见上 */
function cspPlugin(): Plugin {
  return {
    name: "dawn-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) =>
        html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        ),
    },
  }
}

export default defineConfig({
  root: "src/ui",
  base: "./",
  plugins: [react(), cspPlugin()],
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
  },
  server: { port: 5273, strictPort: true },
})
