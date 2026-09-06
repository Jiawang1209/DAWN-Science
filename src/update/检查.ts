/**
 * 查更新的全部判断（规格 U2）：**什么时候查、查完算什么、失败怎么说**。
 *
 * 三条不显然的：
 *   1. **节流用「上次成功查完的时刻」**，失败不前移它——否则一次超时会把接下来
 *      24 小时全堵死，而人完全看不出为什么再也不提示了。
 *   2. **自动那次失败不打扰、手动那次失败必须出声**（规格 7.5 的分寸）：
 *      前者没人要求过，后者是人刚刚亲手要的。这里只负责把 `failed` 算出来，
 *      「说不说」由调用方按 `自动` 决定。
 *   3. **忽略不是抹掉**：`ignored` 仍然带着全部信息，关于那一格照样画得出来。
 */
import { 是更新的, 解析版本 } from "./版本.js"
import { 挑资源, type 平台事实 } from "./资源.js"
import type { 发布源, 发布一条 } from "./发布源.js"
import { 盘面默认值, type 更新盘面, type 更新状态, type 可装性 } from "./状态.js"

const 一天 = 24 * 3600_000

export interface 管家选项 {
  当前版本: string
  源: 发布源
  事实: 平台事实
  读状态: () => 更新盘面
  写状态: (下一个: 更新盘面) => void
  现在?: () => number
  /**
   * 上次下好的那个包还在不在（2026-09-06）。
   *
   * **不查这一下的后果很具体**：下好了、没重启、关掉应用，再打开时
   * 我们会说「有新版本」并让人**再下一遍 223 MB**——而那个包就躺在
   * `userData/update/` 里。
   */
  包还在?: (路径: string) => boolean
}

export class 更新管家 {
  private 状态: 更新状态
  /** 最近一次查到的那条。`设偏好` 要靠它就地重算，不必再联网 */
  private 最近: 发布一条 | undefined
  private readonly 现在: () => number

  constructor(private readonly o: 管家选项) {
    this.现在 = o.现在 ?? (() => Date.now())
    this.状态 = { 阶段: "idle", 当前: o.当前版本 }
  }

  当前状态(): 更新状态 {
    return this.状态
  }

  private 盘(): 更新盘面 {
    return { ...盘面默认值, ...this.o.读状态() }
  }

  /**
   * @param 自动 启动时那次（受「auto」开关与 24 小时节流约束）；false = 人自己点的
   */
  async 检查({ 自动 }: { 自动: boolean }): Promise<更新状态> {
    const 盘 = this.盘()
    if (自动) {
      if (!盘.auto) return this.状态
      if (盘.lastCheckedAt !== undefined && this.现在() - 盘.lastCheckedAt < 一天) return this.状态
    }
    this.状态 = { 阶段: "checking", 当前: this.o.当前版本 }
    let 一条: 发布一条 | undefined
    try {
      一条 = await this.o.源.查最新()
    } catch (e) {
      // 原话原样带出去。**这里不写盘**——失败不许前移 lastCheckedAt
      this.状态 = {
        阶段: "failed",
        当前: this.o.当前版本,
        原话: e instanceof Error ? e.message : String(e),
        失败于: "检查",
      }
      return this.状态
    }
    const 查于 = this.现在()
    this.o.写状态({ ...盘, lastCheckedAt: 查于 })
    this.最近 = 一条
    this.状态 = this.算(一条, 查于, 盘.ignored)
    return this.状态
  }

  /**
   * 下载那一段的状态迁移。**都由管家改**——状态只有一份，
   * 服务层自己拼一份出来的话，推给界面的与这里算的迟早不一样。
   */
  开始下载(共: number): 更新状态 {
    const s = this.状态
    if (s.阶段 !== "available" && s.阶段 !== "ignored") return s
    const { 阶段: _丢, ...其余 } = s
    this.状态 = { 阶段: "downloading", ...其余, 已下: 0, 共 }
    return this.状态
  }

  下载进度(已下: number, 共: number): 更新状态 {
    if (this.状态.阶段 !== "downloading") return this.状态
    this.状态 = { ...this.状态, 已下, 共 }
    return this.状态
  }

  下好了(包路径: string): 更新状态 {
    const s = this.状态
    if (s.阶段 !== "downloading") return s
    const { 阶段: _丢, 已下: _丢2, 共: _丢3, ...其余 } = s
    this.状态 = { 阶段: "ready", ...其余, 包路径 }
    const 盘 = this.盘()
    this.o.写状态({ ...盘, ready: { 版本: 其余.版本, 包路径 } })
    return this.状态
  }

  /** 下载被取消：**退回「有新版」**，不是退回「什么都没发生」 */
  取消了(): 更新状态 {
    const s = this.状态
    if (s.阶段 !== "downloading") return s
    const { 阶段: _丢, 已下: _丢2, 共: _丢3, ...其余 } = s
    this.状态 = { 阶段: "available", ...其余 }
    return this.状态
  }

  /** 出事了。**原话带着**（规格 7.5），并且说清是哪一步 */
  出错(原话: string, 失败于: "检查" | "下载" | "安装"): 更新状态 {
    this.状态 = { 阶段: "failed", 当前: this.o.当前版本, 原话, 失败于 }
    return this.状态
  }

  /** 「这一版不再提醒」/「启动时自动检查」。就地重算，不联网 */
  设偏好(改: { auto?: boolean | undefined; ignore?: string | undefined }): 更新状态 {
    const 盘 = this.盘()
    const 下一个: 更新盘面 = {
      ...盘,
      ...(改.auto === undefined ? {} : { auto: 改.auto }),
      ...(改.ignore === undefined ? {} : { ignored: 改.ignore }),
    }
    this.o.写状态(下一个)
    if (this.最近 && (this.状态.阶段 === "available" || this.状态.阶段 === "ignored")) {
      this.状态 = this.算(this.最近, this.状态.查于, 下一个.ignored)
    }
    return this.状态
  }

  private 算(一条: 发布一条 | undefined, 查于: number, 忽略的: string | undefined): 更新状态 {
    const 当前 = this.o.当前版本
    // 一个 Release 都没有 = 没有更新的。**不是错误**
    if (!一条) return { 阶段: "latest", 当前, 查于 }
    let 新: boolean
    try {
      新 = 是更新的(一条.版本, 当前)
    } catch (e) {
      // tag 认不出来时说清楚是 tag 的问题，不要伪装成「已是最新」
      return { 阶段: "failed", 当前, 原话: e instanceof Error ? e.message : String(e), 失败于: "检查" }
    }
    if (!新) return { 阶段: "latest", 当前, 查于 }

    const 结论 = 挑资源(一条.资源, this.o.事实)
    const 安装: 可装性 = 结论.能自装
      ? { 能: true, 资源: 结论.资源, 方式: 结论.方式 }
      : { 能: false, 因为: 结论.原因 }
    const 被忽略 = 忽略的 !== undefined && 同一版(忽略的, 一条.版本)
    // 上一次已经下好、还没装的那个包：**直接进 ready，不让人再下一遍**
    const 已下好 = this.盘().ready
    if (
      已下好 &&
      同一版(已下好.版本, 一条.版本) &&
      (this.o.包还在?.(已下好.包路径) ?? false)
    ) {
      return {
        阶段: "ready",
        当前,
        版本: 一条.版本,
        页面: 一条.页面,
        ...(一条.发布于 ? { 发布于: 一条.发布于 } : {}),
        查于,
        安装,
        包路径: 已下好.包路径,
      }
    }
    return {
      阶段: 被忽略 ? "ignored" : "available",
      当前,
      版本: 一条.版本,
      页面: 一条.页面,
      ...(一条.发布于 ? { 发布于: 一条.发布于 } : {}),
      查于,
      安装,
    }
  }
}

/** `v0.0.3` 与 `0.0.3` 是同一版。忽略记的是哪种写法都不该影响判断 */
function 同一版(a: string, b: string): boolean {
  try {
    const x = 解析版本(a)
    const y = 解析版本(b)
    return x.major === y.major && x.minor === y.minor && x.patch === y.patch && x.预发布 === y.预发布
  } catch {
    return a === b
  }
}
