/**
 * `userData/update.json`（规格 U8）。**机器写的状态，不进 `providers.yaml`**
 * ——那份是给人手写的。
 *
 * 读不出来时**回默认值并出声**：静默把 `auto` 当成 false，一个坏掉的文件
 * 就能把整个更新提示悄悄关掉，而没有任何人看得出发生了什么。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { 盘面默认值, type 更新盘面 } from "./状态.js"

export class 更新状态存储 {
  constructor(
    private readonly 文件: string,
    private readonly 出声: (话: string) => void = (m) => console.error(`[更新] ${m}`),
  ) {}

  读(): 更新盘面 {
    if (!existsSync(this.文件)) return { ...盘面默认值 }
    let j: unknown
    try {
      j = JSON.parse(readFileSync(this.文件, "utf8"))
    } catch (e) {
      this.出声(`update.json 读不出来，这次按默认值走：${e instanceof Error ? e.message : String(e)}`)
      return { ...盘面默认值 }
    }
    if (typeof j !== "object" || j === null) {
      this.出声("update.json 里不是一个对象，这次按默认值走")
      return { ...盘面默认值 }
    }
    // 逐个字段挑，类型不对的当没有——老版本写的、手改坏的都走这条
    const o = j as Record<string, unknown>
    return {
      auto: typeof o.auto === "boolean" ? o.auto : 盘面默认值.auto,
      ...(typeof o.lastCheckedAt === "number" ? { lastCheckedAt: o.lastCheckedAt } : {}),
      ...(typeof o.ignored === "string" ? { ignored: o.ignored } : {}),
      ...(是ready(o.ready) ? { ready: o.ready } : {}),
    }
  }

  写(盘: 更新盘面): void {
    try {
      mkdirSync(dirname(this.文件), { recursive: true })
      writeFileSync(this.文件, `${JSON.stringify(盘, null, 2)}\n`)
    } catch (e) {
      // 写不进去不影响这一次的判断，但下次启动会忘掉——说出来
      this.出声(`update.json 写不进去，这次的选择重启后不会被记住：${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

const 是ready = (v: unknown): v is { 版本: string; 包路径: string } =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Record<string, unknown>).版本 === "string" &&
  typeof (v as Record<string, unknown>).包路径 === "string"
