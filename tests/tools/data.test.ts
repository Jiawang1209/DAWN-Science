/**
 * `describe_dataset`：给 agent 的第一个数据工具（2026-08-14）。
 *
 * 它替掉的是「用 `read` 把 CSV 前几十行塞进上下文」。所以这一组用例盯两件事：
 *
 * 1. **数是数出来的**（行数、缺失个数），不是模型看几行猜的；
 * 2. **它自己说清自己的边界**——缺失只在读到的那些行里数、类型是推断的、
 *    没读完就不报总行数。一个看起来精确却其实是估的数，比不给更坏。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDescribeDatasetTool } from "../../src/tools/data.js"

const 清理: string[] = []
afterEach(() => {
  for (const d of 清理.splice(0)) rmSync(d, { recursive: true, force: true })
})

function 工作区(文件: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-data-"))
  清理.push(dir)
  for (const [名, 内容] of Object.entries(文件)) {
    const 全 = join(dir, 名)
    mkdirSync(join(全, ".."), { recursive: true })
    writeFileSync(全, 内容, "utf8")
  }
  return dir
}

const 跑 = async (workspace: string, path: unknown) =>
  createDescribeDatasetTool({ workspace }).execute("c1", { path } as { path?: unknown })

const 样本 = ["city,pop,updated", "北京,21540000,2026-01-01", '"上海, 中国",,2026-01-02'].join("\n")

describe("describe_dataset · 给的是算出来的摘要", () => {
  it("行列数、每列类型与缺失都在", async () => {
    const ws = 工作区({ "data/raw/cities.csv": 样本 })
    const r = await 跑(ws, "data/raw/cities.csv")
    const t = r.content[0]!.text

    expect(r.isError).toBeFalsy()
    expect(t).toContain("行数：2")
    expect(t).toContain("列数：3")
    expect(t).toMatch(/pop：整数，缺 1/)
  })

  /** **引号里的逗号不能把列数弄错**——那种错不报异常，只会让模型读到错的结构 */
  it("引号里的逗号不影响列数", async () => {
    const ws = 工作区({ "a.csv": 样本 })
    expect((await 跑(ws, "a.csv")).content[0]!.text).toContain("列数：3")
  })

  /**
   * **边界要自己说出来。** 缺失个数只在读到的那些行里数——
   * 不说的话，它会被当成整张表的数，而那是一个看起来精确的错数。
   */
  it("说清缺失是在多少行里数的，也说清类型是推断的", async () => {
    const ws = 工作区({ "a.csv": 样本 })
    const t = (await 跑(ws, "a.csv")).content[0]!.text
    expect(t).toMatch(/缺失个数是在读到的前 \d+ 行里数的/)
    expect(t).toContain("推断")
  })

  it("给几行样子，但**不是把数据搬进上下文**", async () => {
    const 多 = ["a,b", ...Array.from({ length: 50 }, (_v, i) => `${i},x`)].join("\n")
    const ws = 工作区({ "big.csv": 多 })
    const t = (await 跑(ws, "big.csv")).content[0]!.text
    expect(t).toContain("行数：50")
    // 50 行里只应出现 3 行样例
    expect(t.split("\n").filter((l) => /^\s{2}\d+ \| x$/.test(l))).toHaveLength(3)
  })
})

describe("describe_dataset · 拒绝要说得清，让模型能改道", () => {
  /**
   * **越界与不存在是两回事。** 笼统回一句「读不了」，
   * 模型会反复换着法子试同一条死路。
   */
  it("越界的路径被拒，且理由是路径守卫那句原话", async () => {
    const ws = 工作区({ "a.csv": 样本 })
    const r = await 跑(ws, "../../etc/passwd")
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text, "拒绝理由被压成了一句笼统的话").not.toMatch(/^读不了.*Error/)
  })

  it("不是分隔文本时**说明它是什么**，并指一条路", async () => {
    const ws = 工作区({ "readme.md": "# 标题\n" })
    const r = await 跑(ws, "readme.md")
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toMatch(/text\/markdown/)
    expect(r.content[0]!.text, "要告诉它改用 read").toContain("read")
  })

  it("没给 path 时说清要什么", async () => {
    const ws = 工作区({ "a.csv": 样本 })
    const r = await 跑(ws, undefined)
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("path")
  })
})

describe("describe_dataset · 工具契约", () => {
  /**
   * **名字与参数名是契约**。改了它们，模型手上那份工具清单就对不上了——
   * 而那不会报错，只会让它调用失败之后换别的路子。
   */
  it("名字是 describe_dataset，参数是 path", () => {
    const t = createDescribeDatasetTool({ workspace: "/w" })
    expect(t.name).toBe("describe_dataset")
    expect(Object.keys((t.parameters as { properties: object }).properties)).toEqual(["path"])
  })

  /** **描述里要劝它别用 `read`**：不劝的话，模型多半还是照老路走 */
  it("描述里点名了「不要用 read 把整个文件读进来」", () => {
    expect(createDescribeDatasetTool({ workspace: "/w" }).description).toContain("read")
  })
})
