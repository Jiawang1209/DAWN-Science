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

const external = ["electron", "better-sqlite3", "node-pty", "zeromq"]

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

console.log("build-electron: dist/electron/main.js + preload.cjs 已生成")
