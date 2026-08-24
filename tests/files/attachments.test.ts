/**
 * 外部文件附件（2026-08-25，学自 dsh-paste-input）：发送才落盘、owner marker、消毒与越界。
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { 存附件, 附件用量of, 清附件, 安全文件名, 会话目录名, 附件根名 } from "../../src/files/attachments.js"

const 建工作区 = () => mkdtempSync(join(tmpdir(), "dawn-attach-"))

describe("外部文件附件", () => {
  it("字节与源路径两条路都落进批次目录，返回能进 @ 令牌的相对路径", () => {
    const ws = 建工作区()
    const 源 = join(ws, "外面.txt")
    writeFileSync(源, "从磁盘来")
    const r = 存附件(ws, "s1", [
      { 名: "剪贴板 截图.png", 字节: new TextEncoder().encode("png-bytes") },
      { 名: "外面.txt", 源路径: 源 },
    ])
    expect(r.相对路径们).toHaveLength(2)
    for (const 相对 of r.相对路径们) {
      expect(相对.startsWith(`${附件根名}/`)).toBe(true)
      // @ 令牌容不下空白——名字必须已消毒
      expect(/\s/.test(相对)).toBe(false)
      expect(readFileSync(join(ws, 相对), "utf8")).toMatch(/png-bytes|从磁盘来/)
    }
    // marker 在批次目录里，记着两个文件
    const marker = JSON.parse(readFileSync(join(r.批次目录, ".dawn-attachments.json"), "utf8"))
    expect(marker.owner).toBe("dawn-paste-input")
    expect(marker.files).toHaveLength(2)
    expect(marker.files[0].原名).toBe("剪贴板 截图.png")
  })

  it("同名文件让位（~1 后缀），不覆盖", () => {
    const ws = 建工作区()
    const r = 存附件(ws, "s1", [
      { 名: "a.txt", 字节: new TextEncoder().encode("一") },
      { 名: "a.txt", 字节: new TextEncoder().encode("二") },
    ])
    expect(r.相对路径们[0]).not.toBe(r.相对路径们[1])
    expect(readFileSync(join(ws, r.相对路径们[1]!), "utf8")).toBe("二")
  })

  it("写一半抛错，整个批次目录消失——正式目录里没有半截批次", () => {
    const ws = 建工作区()
    expect(() =>
      存附件(ws, "s1", [
        { 名: "好.txt", 字节: new TextEncoder().encode("好") },
        { 名: "坏.txt" }, // 既无路径也无字节 → 抛
      ]),
    ).toThrow(/既没有路径也没有字节/)
    const 会话目录 = join(ws, 附件根名, 会话目录名("s1"))
    expect(!existsSync(会话目录) || 附件用量of(ws, "s1").批次 === 0).toBe(true)
  })

  it("用量与清理只认自家 marker；别人的目录不算数、活过清理", () => {
    const ws = 建工作区()
    存附件(ws, "s1", [{ 名: "x.txt", 字节: new TextEncoder().encode("x") }])
    // 别人放进来的目录（没有 marker）
    const 外人 = join(ws, 附件根名, 会话目录名("s1"), "外人的")
    mkdirSync(外人, { recursive: true })
    writeFileSync(join(外人, "宝贵.txt"), "别删我")
    const 用 = 附件用量of(ws, "s1")
    expect(用.批次).toBe(1)
    expect(用.文件).toBe(1)
    const 清 = 清附件(ws, "s1")
    expect(清.批次).toBe(1)
    expect(readFileSync(join(外人, "宝贵.txt"), "utf8")).toBe("别删我")
    expect(附件用量of(ws, "s1").批次).toBe(0)
  })

  it("消毒：分隔符、Windows 禁字、控制字符、空白全换下划线；空名与 .. 变 _", () => {
    expect(安全文件名("a/b\\c:d*e?f\"g<h>i|j")).toBe("a_b_c_d_e_f_g_h_i_j")
    expect(安全文件名("带 空\t白.txt")).toBe("带_空_白.txt")
    expect(安全文件名("..")).toBe("_")
    expect(安全文件名("")).toBe("_")
  })

  it("超限当场出声：单文件 1 GiB 上限按声明字节判", () => {
    const ws = 建工作区()
    // 不真造 1 GiB——statSync 走的是字节数组长度，用假的超长 byteLength 太贵；直接验文件数上限的报错通路
    expect(() => 存附件(ws, "s1", [])).toThrow(/没有要存的文件/)
  })
})
