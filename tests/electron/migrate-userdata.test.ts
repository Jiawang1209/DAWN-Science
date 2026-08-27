import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { 迁旧数据 } from "../../src/electron/migrate-userdata.js"

const 造 = () => {
  const root = mkdtempSync(join(tmpdir(), "dawn-migrate-"))
  const 旧 = join(root, "Electron")
  const 新 = join(root, "DAWN Science")
  mkdirSync(旧, { recursive: true })
  mkdirSync(新, { recursive: true })
  return { 旧, 新 }
}

describe("迁旧数据（打包后 userData 换名）", () => {
  it("旧目录有 db、新目录没有 → 拷清单里存在的那些，包括 kernels 目录；旧的留着", () => {
    const { 旧, 新 } = 造()
    writeFileSync(join(旧, "dawn.db"), "db")
    writeFileSync(join(旧, "providers.yaml"), "agents: {}")
    mkdirSync(join(旧, "kernels", "c1", "python"), { recursive: true })
    writeFileSync(join(旧, "kernels", "c1", "python", "x"), "1")
    const r = 迁旧数据(旧, 新)
    expect(r.做了).toBe(true)
    expect(r.拷了).toEqual(["dawn.db", "providers.yaml", "kernels"])
    expect(readFileSync(join(新, "dawn.db"), "utf8")).toBe("db")
    expect(existsSync(join(新, "kernels", "c1", "python", "x"))).toBe(true)
    expect(existsSync(join(旧, "dawn.db"))).toBe(true)
  })
  it("新目录已有 db → 一个字不动（只迁一次）", () => {
    const { 旧, 新 } = 造()
    writeFileSync(join(旧, "dawn.db"), "old")
    writeFileSync(join(新, "dawn.db"), "new")
    expect(迁旧数据(旧, 新)).toEqual({ 做了: false, 拷了: [], 原因: "新目录已有数据库" })
    expect(readFileSync(join(新, "dawn.db"), "utf8")).toBe("new")
  })
  it("旧目录没有 db（新电脑）→ 不动", () => {
    const { 旧, 新 } = 造()
    expect(迁旧数据(旧, 新).原因).toBe("旧目录没有数据库")
  })
})
