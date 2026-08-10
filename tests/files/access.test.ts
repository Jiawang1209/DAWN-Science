/**
 * 工作区文件访问（②-B · F1）。
 *
 * ## 这份测试的重心是「越界必须被挡下」
 *
 * 开了「读文件」这个口子之后，**渲染进程就能问后端要任意路径的内容**。
 * 功能坏了顶多不好用；守卫坏了是任意文件读取。
 *
 * 所以下面把能想到的绕法逐个试一遍——**特别是符号链接**：
 * 它是唯一一种**字符串前缀比对完全挡不住**的绕法，
 * `ws/link → /etc` 的 `resolve()` 结果仍然以 `ws` 开头。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DIR_MAX_ENTRIES,
  PDF_MAX_BYTES,
  TEXT_MAX_BYTES,
  listDirectory,
  mediaTypeOf,
  readFileForPreview,
  resolveInWorkspace,
} from "../../src/files/access.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** 造一个工作区，外面再放一个「机密文件」 */
function ws(): { root: string; outside: string } {
  const base = mkdtempSync(join(tmpdir(), "dawn-files-"))
  dirs.push(base)
  const root = join(base, "workspace")
  mkdirSync(root, { recursive: true })
  const outside = join(base, "机密.txt")
  writeFileSync(outside, "不该被读到")
  return { root, outside }
}

describe("路径守卫：越界必须被挡下", () => {
  it("**`..` 走出去**", () => {
    const { root } = ws()
    expect(() => resolveInWorkspace(root, "../机密.txt")).toThrow(/工作区之外|找不到/)
  })

  it("**多层 `..`**", () => {
    const { root } = ws()
    expect(() => resolveInWorkspace(root, "a/../../../etc/passwd")).toThrow()
  })

  it("**绝对路径一律拒绝** —— 这个接口的语义是工作区内的相对路径", () => {
    const { root } = ws()
    expect(() => resolveInWorkspace(root, "/etc/passwd")).toThrow(/不接受绝对路径/)
  })

  it("**符号链接指到工作区外** —— 字符串前缀比对完全挡不住这一种", () => {
    const { root, outside } = ws()
    symlinkSync(outside, join(root, "看起来很正常.txt"))
    expect(() => resolveInWorkspace(root, "看起来很正常.txt")).toThrow(/工作区之外/)
  })

  it("**目录符号链接** —— 链接本身在工作区里，指向的却不是", () => {
    const { root } = ws()
    const 外面 = mkdtempSync(join(tmpdir(), "dawn-outside-"))
    dirs.push(外面)
    writeFileSync(join(外面, "x.txt"), "外面的")
    symlinkSync(外面, join(root, "link"))
    expect(() => resolveInWorkspace(root, "link/x.txt")).toThrow(/工作区之外/)
  })

  it("**同前缀的兄弟目录不算子路径** —— `/ws-evil` 不是 `/ws` 的里面", () => {
    const base = mkdtempSync(join(tmpdir(), "dawn-sib-"))
    dirs.push(base)
    const root = join(base, "ws")
    mkdirSync(root)
    const evil = join(base, "ws-evil")
    mkdirSync(evil)
    writeFileSync(join(evil, "x.txt"), "不该读到")
    expect(() => resolveInWorkspace(root, "../ws-evil/x.txt")).toThrow(/工作区之外/)
  })

  it("**越界是抛异常，不是返回空** —— 空内容会被读成「这个文件是空的」", () => {
    const { root } = ws()
    let threw = false
    try {
      resolveInWorkspace(root, "../机密.txt")
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it("工作区内的正常路径放行", () => {
    const { root } = ws()
    mkdirSync(join(root, "out"))
    writeFileSync(join(root, "out", "a.txt"), "hi")
    expect(() => resolveInWorkspace(root, "out/a.txt")).not.toThrow()
  })
})

describe("列目录", () => {
  it("目录在前、同类按名字 —— **顺序要稳**，每次刷新都跳会让人失去方位", () => {
    const { root } = ws()
    mkdirSync(join(root, "zzz"))
    writeFileSync(join(root, "aaa.txt"), "a")
    mkdirSync(join(root, "bbb"))
    const l = listDirectory(root)
    expect(l.entries.map((e) => e.name)).toEqual(["bbb", "zzz", "aaa.txt"])
  })

  it("**默认忽略的目录要计数**，不是假装它们不存在", () => {
    const { root } = ws()
    mkdirSync(join(root, ".git"))
    mkdirSync(join(root, "node_modules"))
    writeFileSync(join(root, "keep.txt"), "x")
    const l = listDirectory(root)
    expect(l.entries.map((e) => e.name)).toEqual(["keep.txt"])
    expect(l.ignored).toBe(2)
  })

  it("要的话能把忽略的也列出来", () => {
    const { root } = ws()
    mkdirSync(join(root, ".git"))
    const l = listDirectory(root, "", { includeIgnored: true })
    expect(l.entries.map((e) => e.name)).toContain(".git")
  })

  it("文件带大小、目录不带 —— **目录的「大小」是个误导**", () => {
    const { root } = ws()
    mkdirSync(join(root, "d"))
    writeFileSync(join(root, "f.txt"), "12345")
    const l = listDirectory(root)
    expect(l.entries.find((e) => e.name === "f.txt")!.size).toBe(5)
    expect(l.entries.find((e) => e.name === "d")).not.toHaveProperty("size")
  })

  it("**断链的符号链接跳过但计数** —— 不假装它不存在", () => {
    const { root } = ws()
    symlinkSync(join(root, "并不存在"), join(root, "断链"))
    const l = listDirectory(root)
    expect(l.entries.map((e) => e.name)).not.toContain("断链")
    expect(l.ignored).toBe(1)
  })

  it("超过上界时**说清省了多少**", () => {
    const { root } = ws()
    for (let i = 0; i < DIR_MAX_ENTRIES + 5; i++) writeFileSync(join(root, `f${i}.txt`), "")
    const l = listDirectory(root)
    expect(l.entries).toHaveLength(DIR_MAX_ENTRIES)
    expect(l.omitted).toBe(5)
  })

  it("对文件调用列目录 —— 明确报错", () => {
    const { root } = ws()
    writeFileSync(join(root, "f.txt"), "x")
    expect(() => listDirectory(root, "f.txt")).toThrow(/不是目录/)
  })
})

describe("读文件", () => {
  it("文本原样给出", () => {
    const { root } = ws()
    writeFileSync(join(root, "a.md"), "# 标题")
    const c = readFileForPreview(root, "a.md")
    expect(c).toMatchObject({ kind: "text", mediaType: "text/markdown", text: "# 标题" })
  })

  it("**超上界要给真数**，不是「已截断」三个字", () => {
    const { root } = ws()
    writeFileSync(join(root, "big.txt"), "x".repeat(TEXT_MAX_BYTES + 100))
    const c = readFileForPreview(root, "big.txt")
    if (c.kind !== "text") throw new Error("应当是文本")
    expect(c.truncated?.originalBytes).toBe(TEXT_MAX_BYTES + 100)
    expect(c.truncated?.keptBytes).toBeLessThanOrEqual(TEXT_MAX_BYTES)
  })

  it("**按字节截断不能切出半个汉字**", () => {
    const { root } = ws()
    writeFileSync(join(root, "cn.txt"), "字".repeat(TEXT_MAX_BYTES))
    const c = readFileForPreview(root, "cn.txt")
    if (c.kind !== "text") throw new Error("应当是文本")
    expect(c.text).toMatch(/^字+$/)
  })

  it("图片给 base64 与真实字节数", () => {
    const { root } = ws()
    // 1×1 png
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    )
    writeFileSync(join(root, "p.png"), png)
    const c = readFileForPreview(root, "p.png")
    if (c.kind !== "image") throw new Error("应当是图片")
    expect(c.mediaType).toBe("image/png")
    expect(c.bytes).toBe(png.byteLength)
    expect(Buffer.from(c.base64, "base64").byteLength).toBe(png.byteLength)
  })

  it("**PDF 自成一档**（F5）—— 混进 image 的话界面会拿 <img> 去画它，那是个空框", () => {
    const { root } = ws()
    const bytes = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n")
    writeFileSync(join(root, "d.pdf"), bytes)
    const c = readFileForPreview(root, "d.pdf")
    if (c.kind !== "pdf") throw new Error("应当是 pdf")
    expect(c.mediaType).toBe("application/pdf")
    expect(c.bytes).toBe(bytes.byteLength)
    expect(Buffer.from(c.base64, "base64").byteLength).toBe(bytes.byteLength)
  })

  it("**超上界的 PDF 说清多大**，不硬塞进内存", () => {
    const { root } = ws()
    writeFileSync(join(root, "big.pdf"), Buffer.alloc(PDF_MAX_BYTES + 1))
    const c = readFileForPreview(root, "big.pdf")
    if (c.kind !== "other") throw new Error("应当退回 other")
    // **给真数字**，不是一句「太大了」
    expect(c.reason).toMatch(/MB/)
    expect(c.reason).toMatch(/系统程序打开/)
  })

  it("认不出的类型也要说清是什么、多大", () => {
    const { root } = ws()
    writeFileSync(join(root, "x.bin"), Buffer.alloc(16))
    const c = readFileForPreview(root, "x.bin")
    if (c.kind !== "other") throw new Error("应当是 other")
    expect(c.mediaType).toBe("application/octet-stream")
    expect(c.bytes).toBe(16)
  })

  it("对目录调用读文件 —— 明确报错", () => {
    const { root } = ws()
    mkdirSync(join(root, "d"))
    expect(() => readFileForPreview(root, "d")).toThrow(/是目录/)
  })

  it("**读越界文件被挡下**", () => {
    const { root, outside } = ws()
    symlinkSync(outside, join(root, "link.txt"))
    expect(() => readFileForPreview(root, "link.txt")).toThrow(/工作区之外/)
  })
})

describe("mime", () => {
  it("认得的给真类型", () => {
    expect(mediaTypeOf("a/b/c.png")).toBe("image/png")
    expect(mediaTypeOf("x.CSV")).toBe("text/csv")
  })
  it("**认不出就说认不出**，不猜一个", () => {
    expect(mediaTypeOf("x.qqq")).toBe("application/octet-stream")
    expect(mediaTypeOf("没有扩展名")).toBe("application/octet-stream")
  })
})
