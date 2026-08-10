/**
 * 会话标题的推导（2026-08-10）。
 *
 * 它存在的理由是作者的一句话：*「我的会话，会话的 ID 怎么都是一个呢？
 * 我很难辨别具体是哪个会话了。」* 侧栏此前只画 `agentId`。
 */
import { describe, expect, it } from "vitest"
import { TITLE_MAX, deriveSessionTitle } from "../../src/session/title.js"

describe("从第一句话推标题", () => {
  it("短句原样拿来当名字", () => {
    expect(deriveSessionTitle("帮我看看 sales.csv 的分布")).toBe("帮我看看 sales.csv 的分布")
  })

  it("**只取第一行** —— 贴一段数据进来时第二行往往是表头，压成一行只会得到噪声", () => {
    expect(deriveSessionTitle("画个箱线图\nid,name,value\n1,a,2")).toBe("画个箱线图")
  })

  it("前面的空行跳过，不会推出一个空标题", () => {
    expect(deriveSessionTitle("\n\n   \n真正的第一句")).toBe("真正的第一句")
  })

  it("行内的连续空白压成一个 —— 那只是排版，不是结构", () => {
    expect(deriveSessionTitle("跑   一次    回归")).toBe("跑 一次 回归")
  })

  it("**截断要留记号** —— 砍过的标题和天生就短的标题不该长得一样", () => {
    const long = "字".repeat(TITLE_MAX + 20)
    const t = deriveSessionTitle(long)!
    expect(t.endsWith("…")).toBe(true)
    expect([...t]).toHaveLength(TITLE_MAX + 1)
  })

  it("刚好到上界的不加省略号 —— 加了就是在说「还有」，而其实没有", () => {
    const exact = "字".repeat(TITLE_MAX)
    expect(deriveSessionTitle(exact)).toBe(exact)
  })

  it("**推不出来返回 undefined，不返回空串** —— 空串在界面上是一行空白，看起来像加载失败", () => {
    expect(deriveSessionTitle("")).toBeUndefined()
    expect(deriveSessionTitle("   \n\t\n  ")).toBeUndefined()
  })

  it("内核会话贴的是代码，同样能当名字", () => {
    expect(deriveSessionTitle("import pandas as pd\ndf = pd.read_csv('x.csv')")).toBe(
      "import pandas as pd",
    )
  })
})
