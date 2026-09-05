/**
 * 发一版：改 `package.json` 的 version → 提交 → 打 tag。**推是人自己推**（作者定的纪律）。
 *
 * 这一步以前只存在于文档的一句话里（「发版前改它并打 tag」），于是从 2026-08-28 之后
 * 一个 tag 都没再打过——**而 Release 只认 tag**。包因此从来没自动上过 GitHub。
 * 把它变成一条命令，顺带挡住两件事：工作区不干净就打 tag（打出来的包与 tag 对不上），
 * 以及 tag 与 package.json 版本不一致（CI 里也有同一道判据，这里是提前拦）。
 *
 *   npm run release:tag -- 0.1.0
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const 版本 = process.argv[2]
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).trim()

if (!版本 || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(版本)) {
  console.error("用法：npm run release:tag -- <版本>，例如 0.1.0（不要带 v，脚本会加）")
  process.exit(2)
}

// **工作区必须干净**：脏工作区打出来的 tag 指向的提交里没有你手上那些改动，
// 而 CI 是照 tag 检出来打包的——发出去的包与你以为发的东西不是一个。
const 脏 = sh("git", ["status", "--porcelain"])
  .split("\n")
  .filter((l) => l && !l.includes(".omc/"))
if (脏.length) {
  console.error(`工作区不干净，先提交或撤掉：\n${脏.join("\n")}`)
  process.exit(1)
}

const tag = `v${版本}`
if (sh("git", ["tag", "--list", tag])) {
  console.error(`tag ${tag} 已经有了。要重发同一个版本，先 git tag -d ${tag}（远端那个要你自己删）`)
  process.exit(1)
}

const p = resolve(ROOT, "package.json")
const 原文 = readFileSync(p, "utf8")
const 旧 = JSON.parse(原文).version
if (旧 === 版本) {
  console.log(`package.json 已经是 ${版本}，只打 tag`)
} else {
  // 只换 version 那一行，不重排整个 JSON——`JSON.stringify` 会把格式与键序全洗一遍
  const 新文 = 原文.replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, `$1${版本}$2`)
  if (新文 === 原文) {
    console.error("没能在 package.json 里替换 version 那一行，手动改吧")
    process.exit(1)
  }
  writeFileSync(p, 新文)
  sh("git", ["add", "package.json"])
  sh("git", ["commit", "-m", `chore(release): ${版本}`])
  console.log(`package.json ${旧} → ${版本}，已提交`)
}

sh("git", ["tag", "-a", tag, "-m", `DAWN Science ${版本}`])
console.log(`已打 tag ${tag}（指向 ${sh("git", ["rev-parse", "--short", "HEAD"])}）

**还没推。** 推了才会触发打包与发 Release：

    git push origin main
    git push origin ${tag}

之后去 Actions 看 package 那条。跑完 Releases 里**直接就是正式的一版**（release.yml 里 draft: false）；
某个平台打挂了照发其余的，缺谁会写在 Release 说明第一行。`)
