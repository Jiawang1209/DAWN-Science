/**
 * 假发布源（2026-09-06，规格 `2026-09-06-应用内更新-design.md` §U6）。
 *
 * **`dev:mock` 与 e2e 共用这一份**（准入规则 1，与 `fake-feishu-server.mjs` 同一条纪律）。
 * 回的是**真 GitHub 那个形状**——解析器只有一份（`src/update/发布源.ts`），
 * 端点由 `DAWN_UPDATE_FEED` 指过来。两份解析必然各自漂移，那时
 * 「本地是好的」就不再意味着什么。
 *
 *   GET  /releases/latest       → GitHub 形状的一条（tag_name / html_url / assets…）
 *   GET  /pkg/<名字>            → 假包本身（真的能下下来，字节数与 assets 里说的一致）
 * 测试那一侧（真协议里没有）：
 *   POST /__fake/version        { version } 换成另一版
 *   POST /__fake/none           这个仓库一个 Release 都没有（404）
 *   POST /__fake/fail           { status } 下一次查回这个状态码
 */
import http from "node:http"

/** 十个资源的名字与真 v0.0.2 完全同构（只是内容是假的） */
const 资源名 = (版本) => [
  `DAWN-Science-${版本}-linux-amd64.deb`,
  `DAWN-Science-${版本}-linux-arm64.AppImage`,
  `DAWN-Science-${版本}-linux-arm64.deb`,
  `DAWN-Science-${版本}-linux-x86_64.AppImage`,
  `DAWN-Science-${版本}-mac-arm64.dmg`,
  `DAWN-Science-${版本}-mac-arm64.zip`,
  `DAWN-Science-${版本}-mac-x64.dmg`,
  `DAWN-Science-${版本}-mac-x64.zip`,
  `DAWN-Science-${版本}-win-x64-portable.exe`,
  `DAWN-Science-${版本}-win-x64.exe`,
]

export function startFakeReleaseFeed(opts = {}) {
  let 版本 = opts.version ?? "9.9.9"
  /** 假包多大（字节）。默认小一点，e2e 下得快 */
  const 包大小 = opts.packageBytes ?? 64 * 1024
  let 没有Release = false
  let 下次状态码 = 0

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x")
    if (u.pathname === "/__fake/version") {
      let b = ""
      req.on("data", (c) => (b += c))
      req.on("end", () => {
        版本 = JSON.parse(b || "{}").version ?? 版本
        没有Release = false
        res.writeHead(200).end("{}")
      })
      return
    }
    if (u.pathname === "/__fake/none") {
      没有Release = true
      res.writeHead(200).end("{}")
      return
    }
    if (u.pathname === "/__fake/fail") {
      let b = ""
      req.on("data", (c) => (b += c))
      req.on("end", () => {
        下次状态码 = JSON.parse(b || "{}").status ?? 500
        res.writeHead(200).end("{}")
      })
      return
    }
    if (u.pathname === "/releases/latest") {
      if (下次状态码) {
        const s = 下次状态码
        下次状态码 = 0
        res.writeHead(s, { "content-type": "application/json" }).end(JSON.stringify({ message: "假的" }))
        return
      }
      // 一个 Release 都没有 = 404。**这不是错误**，解析器要把它读成「没有更新的」
      if (没有Release) {
        res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ message: "Not Found" }))
        return
      }
      const 根 = `http://127.0.0.1:${server.address().port}`
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          tag_name: `v${版本}`,
          html_url: `https://example.invalid/releases/tag/v${版本}`,
          published_at: "2026-09-06T00:00:00Z",
          draft: false,
          prerelease: false,
          assets: 资源名(版本).map((name) => ({
            name,
            size: 包大小,
            browser_download_url: `${根}/pkg/${name}`,
          })),
        }),
      )
      return
    }
    if (u.pathname.startsWith("/pkg/")) {
      // 真的把字节吐出来：下载那条路（进度、大小核对）要真的走一遍
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(包大小) })
      res.end(Buffer.alloc(包大小, 7))
      return
    }
    res.writeHead(404).end()
  })
  server.listen(opts.port ?? 0, "127.0.0.1")
  return {
    get url() {
      return `http://127.0.0.1:${server.address().port}/releases/latest`
    },
    get 根() {
      return `http://127.0.0.1:${server.address().port}`
    },
    设版本(v) {
      版本 = v
    },
    close: () => new Promise((r) => server.close(r)),
  }
}
