/**
 * key 交接（规格 U5）——作者点名要的那一半：**换一版之后不用重填 key**。
 *
 * 根因是钥匙串的 ACL 认二进制：新版 `.app` 是另一个二进制，解不开上一版加的密文。
 * 签名能解决；不签名就得由**还活着的旧版**把明文交给新版。
 *
 * 盯的四件：**接得上**、**文件是 0600**、**用完必删（成功与失败两条路都删）**、
 * **接不上时不假装接上了**。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync, statSync, existsSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 交接箱 } from "../../src/update/交接.js"

const 起 = (over: { 机器id?: string | undefined } = {}) => {
  const 目录 = mkdtempSync(join(tmpdir(), "dawn-handoff-"))
  const 喊: string[] = []
  const 箱 = new 交接箱({
    文件: join(目录, "handoff.json"),
    盐文件: join(目录, ".handoff-salt"),
    机器id: () => ("机器id" in over ? over.机器id : "MACHINE-UUID-1"),
    出声: (m) => 喊.push(m),
  })
  return { 目录, 箱, 喊, 文件: join(目录, "handoff.json") }
}

describe("交接箱", () => {
  it("写进去、读出来，一模一样", () => {
    const { 箱 } = 起()
    const 条目 = { deepseek: "sk-真的很长的一个key", "ssh:cluster": "口令 with 空格 和 emoji 🌱" }
    expect(箱.写({ 条目, 从: "0.0.2", 到: "0.0.3" })).toBe(true)
    expect(箱.读()).toEqual(条目)
  })

  it("文件是 0600——它在盘上待着的那几秒里不该谁都能读", () => {
    const { 箱, 文件 } = 起()
    箱.写({ 条目: { a: "b" }, 从: "0.0.2", 到: "0.0.3" })
    expect(statSync(文件).mode & 0o777).toBe(0o600)
  })

  it("读完就删——成功那条路", () => {
    const { 箱, 文件 } = 起()
    箱.写({ 条目: { a: "b" }, 从: "0.0.2", 到: "0.0.3" })
    箱.读()
    箱.清()
    expect(existsSync(文件)).toBe(false)
  })

  it("**换了一台机器就解不开**，而且是「解不开」不是「解出乱码」", () => {
    const { 箱, 目录 } = 起()
    箱.写({ 条目: { a: "b" }, 从: "0.0.2", 到: "0.0.3" })
    const 另一台 = new 交接箱({
      文件: join(目录, "handoff.json"),
      盐文件: join(目录, ".handoff-salt"),
      机器id: () => "另一台机器",
      出声: () => {},
    })
    expect(另一台.读()).toBeUndefined()
  })

  it("取不到机器 id → **不交接，并且出声**（不是静默跳过）", () => {
    const { 箱, 喊, 文件 } = 起({ 机器id: undefined })
    expect(箱.写({ 条目: { a: "b" }, 从: "0.0.2", 到: "0.0.3" })).toBe(false)
    expect(existsSync(文件)).toBe(false)
    expect(喊.join()).toMatch(/机器/)
  })

  it("文件坏了 → 读出 undefined 并出声，不抛", () => {
    const { 箱, 喊, 文件 } = 起()
    writeFileSync(文件, "{ 不是 json")
    expect(箱.读()).toBeUndefined()
    expect(喊.join()).toMatch(/handoff/)
  })

  it("没有交接文件时读出 undefined（绝大多数启动都走这条）", () => {
    expect(起().箱.读()).toBeUndefined()
  })

  it("盘上那份不是明文——肉眼能看出 key 就白做了", () => {
    const { 箱, 文件 } = 起()
    箱.写({ 条目: { deepseek: "sk-明明白白" }, 从: "0.0.2", 到: "0.0.3" })
    expect(readFileSync(文件, "utf8")).not.toContain("sk-明明白白")
  })
})
