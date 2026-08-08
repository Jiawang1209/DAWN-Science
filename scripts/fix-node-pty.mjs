/**
 * node-pty 的 Unix 实现依赖一个辅助可执行文件 spawn-helper。
 * 该文件的执行位由 node-pty 自己的 post-install 脚本设置——而当 npm 配置了
 * allowScripts 策略（或用 --ignore-scripts 安装）时，那个脚本不会运行，
 * spawn-helper 留在 0644，于是 pty.spawn() 报 `posix_spawnp failed`。
 *
 * 这个失败信息不提 spawn-helper，排查成本很高，故在本仓库的 postinstall 里兜底。
 *
 * 更干净的做法是让 npm 放行 node-pty 的安装脚本：
 *     npm install-scripts approve node-pty
 * 那样本脚本就是无操作。两者不冲突。
 */
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

// spike 目录有自己的 node_modules（Electron 那份），也会中招，故全仓库扫描
const roots = ["node_modules"]
if (existsSync("spikes")) {
  for (const d of readdirSync("spikes", { withFileTypes: true })) {
    if (d.isDirectory() && existsSync(join("spikes", d.name, "node_modules"))) {
      roots.push(join("spikes", d.name, "node_modules"))
    }
  }
}

const targets = roots
  .flatMap((r) =>
    ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]
      .map((p) => join(r, "node-pty", "prebuilds", p, "spawn-helper")))
  .filter(existsSync)

let fixed = 0
for (const f of targets) {
  if ((statSync(f).mode & 0o111) === 0) {
    chmodSync(f, 0o755)
    fixed++
    console.log(`fix-node-pty: 已为 ${f} 加上执行位`)
  }
}
if (fixed === 0 && targets.length > 0) console.log("fix-node-pty: spawn-helper 执行位正常，无需处理")
