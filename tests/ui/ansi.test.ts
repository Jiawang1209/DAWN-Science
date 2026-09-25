/**
 * ANSI SGR 解析（2026-09-25）。作者的截图：KeyboardInterrupt 那块满屏 `[0;31m`、`[38;5;124m`。
 * 判据：颜色认成类名、认不出的吞掉，**任何转义都不以文字出现**。
 */
import { describe, expect, it } from "vitest"
import { parseAnsi, stripAnsi } from "../../src/ui/ansi.js"

const E = "\x1b"

/** IPython 8 的 KeyboardInterrupt traceback 里真实出现的几种写法 */
const IPYTHON = [
  `${E}[0;31m---------------------------------------------------------------------------${E}[0m`,
  `${E}[0;31mKeyboardInterrupt${E}[0m                         Traceback (most recent call last)`,
  `Cell ${E}[0;32mIn[1], line 2${E}[0m`,
  `${E}[1;32m      1${E}[0m ${E}[38;5;28;01mimport${E}[39;00m ${E}[38;5;21;01mtime${E}[39;00m`,
  `${E}[0;32m----> 2${E}[0m ${E}[43mtime${E}[38;5;241m.${E}[39mfoo${E}[49m`,
  `${E}[38;5;124mKeyboardInterrupt${E}[39m: `,
].join("\n")

describe("parseAnsi", () => {
  it("没有转义的文字原样一段", () => {
    expect(parseAnsi("hello\nworld")).toEqual([{ text: "hello\nworld" }])
  })

  it("基本前景色 31/32，0 复位", () => {
    expect(parseAnsi(`${E}[0;31mred${E}[0m plain ${E}[32mgreen`)).toEqual([
      { text: "red", fg: "red" },
      { text: " plain " },
      { text: "green", fg: "green" },
    ])
  })

  it("亮色 90–97：亮黑是灰，其余同色", () => {
    expect(parseAnsi(`${E}[90ma${E}[91mb${E}[94mc`)).toEqual([
      { text: "a", fg: "gray" },
      { text: "b", fg: "red" },
      { text: "c", fg: "blue" },
    ])
  })

  it("黑 / 白交给默认前景（明暗两种底色上都得读得见）", () => {
    expect(parseAnsi(`${E}[30ma${E}[37mb${E}[97mc`)).toEqual([{ text: "abc" }])
  })

  it("38;5;n：按 256 色表归到色相，参数被吃掉不串成别的码", () => {
    expect(parseAnsi(`${E}[38;5;124mx`)).toEqual([{ text: "x", fg: "red" }])
    expect(parseAnsi(`${E}[38;5;28mx`)).toEqual([{ text: "x", fg: "green" }])
    expect(parseAnsi(`${E}[38;5;21mx`)).toEqual([{ text: "x", fg: "blue" }])
    expect(parseAnsi(`${E}[38;5;241mx`)).toEqual([{ text: "x", fg: "gray" }])
    expect(parseAnsi(`${E}[38;5;208mx`)).toEqual([{ text: "x", fg: "yellow" }])
    expect(parseAnsi(`${E}[38;5;1mx`)).toEqual([{ text: "x", fg: "red" }])
    // `5` 若没被吃掉会被当成「闪烁」，`1` 会被当成粗体
    expect(parseAnsi(`${E}[38;5;1mx`)[0]!.bold).toBeUndefined()
  })

  it("38;2;r;g;b 真彩色同样归类", () => {
    expect(parseAnsi(`${E}[38;2;200;30;30mx`)).toEqual([{ text: "x", fg: "red" }])
    expect(parseAnsi(`${E}[38;2;128;128;128mx`)).toEqual([{ text: "x", fg: "gray" }])
  })

  it("39 只复位前景，49 只复位背景", () => {
    expect(parseAnsi(`${E}[31;43ma${E}[39mb${E}[49mc`)).toEqual([
      { text: "a", fg: "red", bg: "yellow" },
      { text: "b", bg: "yellow" },
      { text: "c" },
    ])
  })

  it("背景 40–47、100–107、48;5;n", () => {
    expect(parseAnsi(`${E}[41ma${E}[0m${E}[102mb${E}[0m${E}[48;5;21mc`)).toEqual([
      { text: "a", bg: "red" },
      { text: "b", bg: "green" },
      { text: "c", bg: "blue" },
    ])
  })

  it("粗体 1 / 22；`01`、`00` 这种带前导零的写法也认", () => {
    expect(parseAnsi(`${E}[01;32ma${E}[22mb${E}[1mc${E}[00md`)).toEqual([
      { text: "a", fg: "green", bold: true },
      { text: "b", fg: "green" },
      { text: "c", fg: "green", bold: true },
      { text: "d" },
    ])
  })

  it("`ESC[m` 等于复位", () => {
    expect(parseAnsi(`${E}[31ma${E}[mb`)).toEqual([{ text: "a", fg: "red" }, { text: "b" }])
  })

  it("认不出的 SGR 码丢掉、不显示；非 SGR 的 CSI / OSC / 字符集切换都吞掉", () => {
    const 输入 = `${E}[3;4;5ma${E}[2K${E}[1Ab${E}]0;title${E}\\c${E}]8;;http://x${E}\\d${E}(Be${E}[?25lf`
    const 片 = parseAnsi(输入)
    expect(片.map((p) => p.text).join("")).toBe("abcdef")
    expect(片.every((p) => p.fg === undefined && p.bg === undefined)).toBe(true)
  })

  it("结尾残缺的转义也不留下 ESC", () => {
    expect(stripAnsi(`a${E}`)).toBe("a")
    expect(stripAnsi(`a${E}[`).includes(E)).toBe(false)
  })

  it("真实 IPython traceback：文字里一个转义残渣都没有，颜色认出来了", () => {
    const 片 = parseAnsi(IPYTHON)
    const 文字 = 片.map((p) => p.text).join("")
    expect(文字).not.toMatch(/\x1b|\[[0-9;]*m/)
    expect(文字).toContain("KeyboardInterrupt                         Traceback")
    expect(文字).toContain("----> 2 time.foo")
    expect(片.find((p) => p.text === "import")).toEqual({ text: "import", fg: "green", bold: true })
    expect(片.find((p) => p.text === "time" && p.bg)).toEqual({ text: "time", bg: "yellow" })
  })
})

describe("stripAnsi", () => {
  it("只剩文字，与 parseAnsi 拼出来的一致", () => {
    expect(stripAnsi(IPYTHON)).toBe(parseAnsi(IPYTHON).map((p) => p.text).join(""))
    expect(stripAnsi(`${E}[0;31mKeyboardInterrupt${E}[0m`)).toBe("KeyboardInterrupt")
  })
})
