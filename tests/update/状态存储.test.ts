/**
 * `userData/update.json`。**读不出来不许当成「用户关掉了自动检查」**——
 * 那会让一个坏文件把整个功能悄悄关掉。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 更新状态存储 } from "../../src/update/状态存储.js"

const 临时 = () => join(mkdtempSync(join(tmpdir(), "dawn-upd-")), "update.json")

describe("更新状态存储", () => {
  it("文件不存在 → 默认值（自动检查是开的）", () => {
    expect(new 更新状态存储(临时()).读()).toEqual({ auto: true })
  })
  it("写了能读回来", () => {
    const f = 临时()
    const 存 = new 更新状态存储(f)
    存.写({ auto: false, lastCheckedAt: 123, ignored: "0.0.3" })
    expect(new 更新状态存储(f).读()).toEqual({ auto: false, lastCheckedAt: 123, ignored: "0.0.3" })
    expect(JSON.parse(readFileSync(f, "utf8")).ignored).toBe("0.0.3")
  })
  it("文件坏了 → 回默认值**并出声**，不静默", () => {
    const f = 临时()
    writeFileSync(f, "{ 这不是 json")
    const 喊 : string[] = []
    expect(new 更新状态存储(f, (m) => 喊.push(m)).读()).toEqual({ auto: true })
    expect(喊.join()).toMatch(/update\.json/)
  })
  it("字段类型不对的当没有，其余照用（老版本写的、手改坏的）", () => {
    const f = 临时()
    writeFileSync(f, JSON.stringify({ auto: "yes", lastCheckedAt: "昨天", ignored: "0.0.3" }))
    expect(new 更新状态存储(f).读()).toEqual({ auto: true, ignored: "0.0.3" })
  })
})
