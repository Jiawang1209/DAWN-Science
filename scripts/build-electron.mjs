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
import { chmodSync, cpSync, existsSync, statSync } from "node:fs"
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
  /**
   * **`ssh2`（②-B · R3 加入）。**
   *
   * 它自己是纯 JS，但可选依赖 `cpu-features` 是原生的，
   * 而 esbuild 会顺着 `require("../build/Release/cpufeatures.node")` 一路解析下去，
   * 于是**构建当场失败**（`Could not resolve`）。
   *
   * `cpu-features` 只是拿来挑更快的加密实现，没有它 ssh2 会退回纯 JS 实现——
   * 也就是说这条 external 不会让功能少一块。
   *
   * 这处是 `ssh2` 从 devDependency 变成 dependency 那一刻才出现的：
   * 在此之前它只活在 spike 与测试里，从不经过这条打包路径。
   * **单测与 typecheck 都发现不了它，只有真构建一次才会撞上。**
   */
  "ssh2",
  "cpu-features",
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

/**
 * **自带技能拷进 dist**（S20，2026-08-15）。
 *
 * 它们是 `SKILL.md` 文本，不经过 esbuild——而这个脚本此前只打包 JS，
 * 一个静态文件都不拷。不拷的话，路径就得从 dist 往上找回仓库根，
 * **那在打包之后必断**（asar 里没有仓库）。
 *
 * 拷到 `dist/skills`，于是运行时那句是 `join(import.meta.dirname, "../skills")`
 * ——与 `preload.cjs`、`../ui/index.html` 同一副做法。
 */
/**
 * 我们那台 MCP 服务器（B1 路线 B，2026-08-17）。
 *
 * **拷成源文件，不打包**：它 `import` 的是 `@modelcontextprotocol/sdk`，
 * 而那份依赖在装好的应用里本来就在 `node_modules` 下——
 * 打进 bundle 只是把同一份代码存两遍。
 *
 * 放在 `dist/electron/` 旁边，因为 `main.ts` 是按 `import.meta.dirname` 找它的。
 */
cpSync(
  join("scripts", "dawn-mcp-server.mjs"),
  join("dist", "electron", "dawn-mcp-server.mjs"),
)
console.log("build-electron: DAWN 的 MCP 服务器已拷进 dist/electron/")

if (existsSync("skills")) {
  cpSync("skills", join("dist", "skills"), { recursive: true })
  // 自带的子 agent（2026-08-22）：与技能同一条理由，随应用发布、只读
  cpSync("agents", join("dist", "agents"), { recursive: true })
  console.log("build-electron: 自带技能已拷进 dist/skills")
}

console.log("build-electron: dist/electron/main.js + subagent-child.js + preload.cjs 已生成")
