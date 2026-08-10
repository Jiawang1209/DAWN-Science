/**
 * 打包 Electron 的主进程与 preload（Task 2.9）。
 *
 * 两者格式不同，这不是随意选的：
 *   - **main 用 ESM** —— 本项目 `"type": "module"`，且 `import.meta.dirname` 需要 ESM
 *   - **preload 用 CJS** —— 开了 `sandbox: true` 的 preload 只能是 CJS，这是 Electron 的硬约束
 *
 * 原生依赖（better-sqlite3 / node-pty）标为 external：它们是 .node 二进制，
 * 打进 bundle 只会得到一个坏掉的文件。
 */
import { build } from "esbuild"
import { chmodSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * external 清单。
 *
 * 原生依赖（better-sqlite3 / node-pty / zeromq）是 .node 二进制，打进 bundle 只会
 * 得到一个坏掉的文件。
 *
 * **pi 全家（2026-08-08 R4 加入）**：它自己会注入 `createRequire`，与我们为
 * external 包注入的那份重名，bundle 后直接 `SyntaxError: Identifier
 * 'createRequire' has already been declared`——**主进程根本起不来**。
 * 它们是纯 JS，不打进 bundle 也照样能从 node_modules 解析。
 * 这个缺陷单测与 typecheck 都发现不了，**只有真启动一次才会撞上**。
 */
const external = [
  "electron",
  "better-sqlite3",
  "node-pty",
  "zeromq",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  /**
   * **Jupyter 那一串（②-A · 2026-08-10 加入）。**
   *
   * `zeromq` 是原生的，本来就在上面。但 `spawnteract` / `enchannel` /
   * `@nteract/messaging` 是纯 JS，打进 bundle 之后会把
   * **rxjs 6 整个内联进主进程包**（实测 863 处）——
   * **每次启动都付这份解析代价，哪怕用户根本不开内核**。
   *
   * `channel.ts` 里已经改成了 `await import()`，但 esbuild 在
   * `bundle: true` 下会把动态 import 内联回同一个 chunk，
   * **所以光靠动态 import 不够，必须同时 external**。
   */
  "spawnteract",
  "enchannel-zmq-backend",
  "@nteract/messaging",
]

await build({
  entryPoints: ["src/electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/electron/main.js",
  external,
  banner: {
    // bundle 后的 ESM 里 require 不存在，但被 external 的包仍会用到它
    js: `import{createRequire}from'node:module';const require=createRequire(import.meta.url);`,
  },
})

/**
 * 子 agent 的进程入口（①-B″ · S1）。
 *
 * **必须与 main 用同一份 external 与同一个 banner。** 它同样 import pi，
 * 于是同样会撞上 R4 记下的那个 `createRequire` 重名——区别只在失败的地方：
 * main 撞上是「应用起不来」，这里撞上是「每个子 agent 都起不来，
 * 而父侧只看到一句退出码非 0」。
 *
 * 输出文件名由 `src/subagent/protocol.ts` 的 `CHILD_ENTRY` 引用，
 * 两边不各写一遍字符串。
 */
await build({
  entryPoints: ["src/subagent/child.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/electron/subagent-child.js",
  external,
  banner: {
    js: `import{createRequire}from'node:module';const require=createRequire(import.meta.url);`,
  },
})

await build({
  entryPoints: ["src/electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "dist/electron/preload.cjs",
  external: ["electron"],
})

/**
 * Spike B 的教训：node-pty 的 `spawn-helper` 执行位由其 post-install 设置，
 * 而 npm 的 allowScripts 策略会拦掉那个脚本。打包后同样会丢——
 * 失败表现是 `posix_spawnp failed`，错误信息里没有任何线索。
 */
let fixed = 0
for (const platform of ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]) {
  const helper = join("node_modules", "node-pty", "prebuilds", platform, "spawn-helper")
  if (existsSync(helper) && (statSync(helper).mode & 0o111) === 0) {
    chmodSync(helper, 0o755)
    fixed++
  }
}
if (fixed > 0) console.log(`build-electron: 已为 ${fixed} 个 spawn-helper 补上执行位`)

console.log("build-electron: dist/electron/main.js + subagent-child.js + preload.cjs 已生成")
