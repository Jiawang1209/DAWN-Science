/**
 * 「线上最新的那一版是什么」（规格 U6）。
 *
 * **真 GitHub 与假 feed 是同一个解析器**，只有端点不同（`DAWN_UPDATE_FEED`）。
 * 两份解析必然各自漂移——那正是准入规则 1 存在的理由：假的那份一漂，
 * `dev:mock` 与 e2e 里看到的就不再是真实契约。
 *
 * 实测（2026-09-06）：匿名调用可用，限额 **60 次/小时/IP**；
 * `/releases/latest` 本身已经排除 draft 与 prerelease，这里再挡一道
 * ——假 feed 可以随便回，端点也可能被换掉。
 */
import type { 资源一个 } from "./资源.js"

export interface 发布一条 {
  /** 原样的 tag（`v0.0.3`）。比较时由 `解析版本` 去前缀 */
  版本: string
  页面: string
  发布于?: string
  资源: 资源一个[]
}

export interface 发布源 {
  查最新(signal?: AbortSignal): Promise<发布一条 | undefined>
}

export interface GitHub发布源选项 {
  /** 完整端点。真的：`https://api.github.com/repos/<owner>/<repo>/releases/latest` */
  端点: string
  fetch?: typeof fetch
  超时毫秒?: number
}

/** GitHub Releases 的公开仓库，匿名可读 */
export const GITHUB_LATEST = "https://api.github.com/repos/Jiawang1209/DAWN-Science/releases/latest"

const 是对象 = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null

export function github发布源(选项: GitHub发布源选项): 发布源 {
  const 取 = 选项.fetch ?? fetch
  const 超时 = 选项.超时毫秒 ?? 10_000
  return {
    async 查最新(外部signal) {
      let r: Response
      try {
        r = await 取(选项.端点, {
          headers: { accept: "application/vnd.github+json", "user-agent": "DAWN-Science" },
          signal: 外部signal ?? AbortSignal.timeout(超时),
        })
      } catch (e) {
        const 名 = e instanceof Error ? e.name : ""
        // 超时说成「超时」并带秒数。裸抛 `The operation was aborted` 谁也看不懂
        if (名 === "TimeoutError" || 名 === "AbortError") {
          throw new Error(`GitHub 没应：超时 ${Math.round(超时 / 1000)} 秒`)
        }
        throw new Error(`连不上 GitHub：${e instanceof Error ? e.message : String(e)}`)
      }
      // 一个 Release 都没发过时 GitHub 回 404。**这不是错误**，是「没有更新的」
      if (r.status === 404) return undefined
      if (!r.ok) throw new Error(`GitHub 回了 ${r.status}`)

      const j: unknown = await r.json()
      if (!是对象(j) || typeof j.tag_name !== "string" || typeof j.html_url !== "string") {
        // 静默当成「没有新版」会让我们在端点变了、字段改名了之后永远安静（规格 7.5）
        throw new Error("GitHub 回的形状不对：缺 tag_name / html_url")
      }
      if (j.draft === true || j.prerelease === true) return undefined

      const 资源: 资源一个[] = (Array.isArray(j.assets) ? j.assets : [])
        .filter(
          (a): a is { name: string; size: number; browser_download_url: string } =>
            是对象(a) &&
            typeof a.name === "string" &&
            typeof a.size === "number" &&
            typeof a.browser_download_url === "string",
        )
        .map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url }))

      return {
        版本: j.tag_name,
        页面: j.html_url,
        ...(typeof j.published_at === "string" ? { 发布于: j.published_at } : {}),
        资源,
      }
    },
  }
}
