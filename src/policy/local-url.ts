/**
 * 「这是不是一条本机地址」——**判定的那一半，两边共用**（批 2，2026-08-18）。
 *
 * ## 为什么要单独拆出来
 *
 * 这个判断有两个读者：
 *
 * - **主进程**（`electron/web-preview.ts`）：它是**权威**。放行之前还要
 *   用 `realpath` 确认 `file:` 真的在工作目录里——那要碰文件系统。
 * - **渲染进程**（`markdown.tsx` / `web.tsx`）：它只需要知道
 *   **「这条链接值不值得给一张卡片、点了该进坞还是进系统浏览器」**。
 *   它碰不到 `fs`，也不该碰。
 *
 * 两边**各写一份主机名规则**是不行的：漂了之后，一条链接会在
 * 「界面说能开」与「主进程说不能」之间打架，而那种不一致没有任何地方会报出来。
 * 所以**规则在这里只有一份**，主进程在它之上再加文件系统那一道。
 *
 * **这个文件不许 import 任何 node 模块**——它要能在渲染进程里跑。
 */

/**
 * 算本机的主机名。**严格相等，不做后缀匹配。**
 *
 * `localhost.evil.com` 与 `127.0.0.1.evil.com` 是真实存在的钓鱼写法，
 * 用 `endsWith` 判会当场把它们放进来。
 */
const 本机主机名 = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

export function 本机主机吗(hostname: string): boolean {
  return 本机主机名.has(hostname)
}

/**
 * 把人打的那一串变成一个 `URL`。认不出来返回 `undefined`——**不猜**。
 *
 * **`localhost:64070` 里那个冒号不是协议。** 只按 `^协议:` 判的话，
 * `localhost` 会被当成协议名、`64070` 当成路径。分辨的办法是看冒号后面：
 * **全是数字就是端口**。（批 1 第一版就是这么错的，判据当场红了。）
 */
export function 解析地址(raw: string): URL | undefined {
  const 原 = raw.trim()
  if (!原) return undefined
  const 像主机端口 = /^[a-zA-Z0-9.-]+:\d+(\/|$|\?)/.test(原)
  const 有协议 = !像主机端口 && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(原)
  try {
    return new URL(有协议 ? 原 : `http://${原}`)
  } catch {
    return undefined
  }
}

/**
 * **看起来像本机的东西吗**（渲染进程用的那一半）。
 *
 * 它答的是「**要不要把这条交给坞里那一格**」，不是「一定能打开」——
 * `file:` 在不在工作目录里，只有主进程说了算，而它会**响亮地**说。
 * 这里放宽一点是有意的：**把一条本该能开的链接送去系统浏览器**，
 * 比「送进坞里、被拒、屏幕上说清为什么」更糟——前者人根本不知道发生了什么。
 */
export function 像本机地址吗(raw: string): boolean {
  const u = 解析地址(raw)
  if (!u) return false
  if (u.protocol === "file:") return true
  if (u.protocol !== "http:" && u.protocol !== "https:") return false
  return 本机主机吗(u.hostname)
}

/**
 * 一段文字里**第一条能在坞里打开的地址**（给消息底下那张卡片用）。
 *
 * **只取第一条**：作者截图里那张卡片就是一张。一条消息里出现好几个地址时，
 * 链接本身照样点得动——卡片是那条主线索的快捷方式，不是清单。
 *
 * **批 3 起它不再只认本机**：那一格现在开得了任意网站，而卡上那颗
 * 「打开方式 ▾」正是让人挑「在这儿开还是去系统浏览器」的地方——
 * 只给本机的话，外网就只剩地址栏一条路进得去，这个功能等于半残。
 *
 * **`file:` 不给卡**：它在不在工作目录里只有主进程说了算，
 * 而一张点了才知道被拒的卡，比没有这张卡更让人困惑。
 */
export function 头一条网址(text: string): string | undefined {
  // markdown 里的地址两边常有 `)`、`。`、`，`，收尾要把它们摘掉
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"'）)】\]]+/g)) {
    const 净 = m[0].replace(/[.,，。；;：:]+$/, "")
    if (解析地址(净)) return 净
  }
  return undefined
}
