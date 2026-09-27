/**
 * 回退这一轮的影子存档（2026-09-27，spec `2026-09-27-回退这一轮-design.md` §4.1）。
 * 真文件系统（临时目录），不 mock `fs`——克隆 / 拷贝 / 权限位这些只有真盘上才说得准。
 */
import { afterEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { 检查点存档 } from "../../src/project/checkpoints.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function 新的(选项: ConstructorParameters<typeof 检查点存档>[2] = {}) {
  const d = mkdtempSync(join(tmpdir(), "dawn-ckpt-"))
  dirs.push(d)
  const ws = join(d, "ws")
  mkdirSync(ws)
  const 存档目录 = join(d, "session", "checkpoints")
  const 喊了: string[] = []
  const 存 = new 检查点存档(ws, 存档目录, { 喊: (话) => 喊了.push(话), ...选项 })
  return { ws, 存档目录, 存, 喊了, 重开: () => new 检查点存档(ws, 存档目录, { 喊: (话) => 喊了.push(话), ...选项 }) }
}
export const 写 = (ws: string, p: string, s: string | Buffer) => {
  mkdirSync(dirname(join(ws, p)), { recursive: true })
  writeFileSync(join(ws, p), s)
}
export const 读 = (ws: string, p: string) => readFileSync(join(ws, p), "utf8")
const 对象数 = (存档目录: string) => readdirSync(join(存档目录, "objects")).length

describe("影子存档 · 拍", () => {
  it("第一句的开头：把工作区里的文件都存一份；同一句第二件工具不再拍", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, "a.py", "print(1)\n")
    写(ws, "out/图.txt", "旧\n")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(2)
    await 存.开轮("e1")
    expect(存.段落()).toEqual([{ kind: "turn", entry: "e1", start: "s1" }])
  })

  it("收尾只拍 stat、不存；下一句开头只存变过的", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, "a.py", "print(1)\n")
    await 存.开轮("e1")
    写(ws, "a.py", "print(22)\n")
    await 存.收尾()
    expect(对象数(存档目录), "收尾不存内容").toBe(1)
    await 存.开轮("e2")
    expect(对象数(存档目录), "a.py 的新版在下一句开头存下").toBe(2)
    expect(存.段落()).toEqual([
      { kind: "turn", entry: "e1", start: "s1", end: "s2" },
      { kind: "turn", entry: "e2", start: "s3" },
    ])
  })

  it("同一轮里 pi 送进下一句：同一张既是上一句的结尾、也是这一句的开头", async () => {
    const { ws, 存 } = 新的()
    写(ws, "a.py", "1\n")
    await 存.开轮("e1")
    写(ws, "a.py", "22\n")
    await 存.开轮("e2")
    expect(存.段落()).toEqual([
      { kind: "turn", entry: "e1", start: "s1", end: "s2" },
      { kind: "turn", entry: "e2", start: "s2" },
    ])
  })

  it("重开：段、起点、已存字节都读得回来", async () => {
    const { ws, 存, 重开 } = 新的()
    存.记起点("leaf-0")
    写(ws, "a.py", "1\n")
    await 存.开轮("e1")
    await 存.收尾()
    const 又 = 重开()
    expect(又.起点()).toBe("leaf-0")
    expect(又.段落()).toEqual(存.段落())
    又.记起点("leaf-9")
    expect(又.起点(), "起点只记第一次").toBe("leaf-0")
  })
})

describe("影子存档 · 上限与跳过（spec §5）", () => {
  it("超过单个上限的不存，记 too_large", async () => {
    const { ws, 存档目录, 存 } = 新的({ 单个上限: 10 })
    写(ws, "big.csv", "0123456789ABC")
    写(ws, "small.txt", "x")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(1)
  })

  it("data/raw 一律不存（原始数据，回退不碰它）", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, "data/raw/survey.csv", "id,v\n1,2\n")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(0)
  })

  it("存档满了：之后的不存，**只喊一次**", async () => {
    const { ws, 存档目录, 存, 喊了 } = 新的({ 总上限: 6 })
    写(ws, "a.txt", "1234")
    写(ws, "b.txt", "5678")
    写(ws, "c.txt", "9abc")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(1)
    await 存.收尾()
    写(ws, "d.txt", "zzzz")
    await 存.开轮("e2")
    expect(喊了.filter((x) => x.includes("存档满了"))).toHaveLength(1)
  })

  it("文件数超上限：这一句记断档、喊一次，不装作存上了", async () => {
    const { ws, 存, 喊了 } = 新的({ cap: 2 })
    for (const n of ["a", "b", "c"]) 写(ws, `${n}.txt`, n)
    await 存.开轮("e1")
    await 存.开轮("e2")
    expect(存.段落()).toEqual([
      { kind: "gap", entry: "e1", reason: "too_many_files" },
      { kind: "gap", entry: "e2", reason: "too_many_files" },
    ])
    expect(喊了.filter((x) => x.includes("没法存档"))).toHaveLength(1)
  })

  it(".dawn 与 node_modules 里的不扫（沿用 FS_SKIP_DIRS）", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, ".dawn/trash/x.txt", "x")
    写(ws, "node_modules/p/index.js", "x")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(0)
    expect(existsSync(join(存档目录, "snapshots.jsonl"))).toBe(true)
  })
})
