/**
 * 工具权限判据（2026-08-13）。
 *
 * **这一组用例的价值全在「判据键得准不准」。** 门接上了却永远不命中，
 * 比没有门更坏——界面上看起来有一道门，而它一次都没拦过。
 * 所以这里的工具名与参数名**逐个对着 pi 的真实契约**写：
 * `write{path,content}` / `edit{path,edits}` / `bash{command}` / `read{path}`。
 */
import { describe, expect, it } from "vitest"
import { 看风险, 照这一档, 造门, type 语境 } from "../../src/policy/permissions.js"

const 本地: 语境 = { workspace: "/w/proj" }
const 远端: 语境 = { workspace: "/home/u/proj", remote: true }

describe("判据 · 原始数据不许改", () => {
  /**
   * 作者定的目录约定：*「`data/raw/`（原始输入，**不修改**）」*。
   * 覆盖原始数据是**不可撤销**的：模型可以重跑，那份数据不能。
   */
  it("写进 data/raw/ 被拦，且说得出去哪儿写", () => {
    const r = 看风险("write", { path: "data/raw/samples.csv", content: "x" }, 本地)
    expect(r?.类别).toBe("原始数据")
    expect(r?.说明, "拒绝理由要能让模型改道，而不是原地打转").toMatch(/data\/processed/)
  })

  it("edit 同样拦 —— 两个工具都能改文件", () => {
    expect(看风险("edit", { path: "data/raw/a.csv", edits: [] }, 本地)?.类别).toBe("原始数据")
  })

  it("绝对路径绕不过去", () => {
    expect(看风险("write", { path: "/w/proj/data/raw/a.csv" }, 本地)?.类别).toBe("原始数据")
  })

  it("**data/processed 放行** —— 衍生数据本来就该写", () => {
    expect(看风险("write", { path: "data/processed/clean.csv" }, 本地)).toBeUndefined()
  })

  /** `data/rawish/` 不是 `data/raw/`。前缀匹配写松了会拦掉无辜的目录 */
  it("只认这一个目录，不按前缀乱认", () => {
    expect(看风险("write", { path: "data/rawish/a.csv" }, 本地)).toBeUndefined()
  })
})

describe("判据 · 不许写到工作区外面", () => {
  it("`../` 逃出去被拦", () => {
    const r = 看风险("write", { path: "../别人的/x.txt" }, 本地)
    expect(r?.类别).toBe("工作区之外")
    expect(r?.说明).toContain("/w/proj")
  })

  it("绝对路径逃出去也被拦", () => {
    expect(看风险("write", { path: "/etc/hosts" }, 本地)?.类别).toBe("工作区之外")
  })

  it("工作区里面照常放行", () => {
    expect(看风险("write", { path: "figures/fig1.png" }, 本地)).toBeUndefined()
  })
})

describe("判据 · bash", () => {
  it.each([
    ["rm -rf results", "删除"],
    ["mv a.csv b.csv", "删除"],
    ["pip install pandas", "装包"],
    ["conda install -y numpy", "装包"],
    ['R -e "install.packages(\'dplyr\')"', "装包"],
    ["install.packages('ggplot2')", "装包"],
    ["curl https://example.com/x.csv -o x.csv", "联网"],
    ["git push origin main", "发布"],
  ])("`%s` → %s", (cmd, 类别) => {
    expect(看风险("bash", { command: cmd }, 本地)?.类别).toBe(类别)
  })

  it.each([
    ["python analysis/scripts/clean.py"],
    ["Rscript analysis/scripts/fit.R"],
    ["ls data/raw"],
    ["git status"],
  ])("`%s` 放行 —— 日常干活的命令不该被拦", (cmd) => {
    expect(看风险("bash", { command: cmd }, 本地)).toBeUndefined()
  })

  /**
   * 一条命令可能同时踩几样（`pip install` 也联网）。
   * **报最要紧的那个**——理由笼统的话，人和模型都不知道该改哪里。
   */
  it("同时踩几样时，报最要紧的那个", () => {
    expect(看风险("bash", { command: "pip install requests" }, 本地)?.类别).toBe("装包")
    expect(看风险("bash", { command: "git push && rm -rf x" }, 本地)?.类别).toBe("发布")
  })

  /** **装包会让已经记下的运行变得不可复现**——理由里要说出这一点 */
  it("装包的理由要说清它动了什么", () => {
    expect(看风险("bash", { command: "pip install x" }, 本地)?.说明).toMatch(/环境|复现/)
  })
})

describe("判据 · 读不拦", () => {
  it("read 一律放行 —— 它不改任何东西", () => {
    expect(看风险("read", { path: "/etc/passwd" }, 本地)).toBeUndefined()
    expect(看风险("read", { path: "data/raw/a.csv" }, 本地)).toBeUndefined()
  })
})

describe("判据 · 远端的理由要指名它是远端", () => {
  /**
   * 计划 §3.2：*「本地跑错一条命令，代价是你自己的工作区；
   * **在共享集群上跑错，代价是别人的**。」*
   */
  it("远端被拦时，说明里点明这是远端", () => {
    const r = 看风险("bash", { command: "rm -rf /data" }, 远端)
    expect(r?.说明).toMatch(/远端/)
  })

  it("本地的说明里不提远端 —— 不说不成立的话", () => {
    expect(看风险("bash", { command: "rm -rf x" }, 本地)?.说明).not.toMatch(/远端/)
  })
})

describe("档位 · 只有两档，因为只做得到两档", () => {
  const 风险 = 看风险("write", { path: "data/raw/a.csv" }, 本地)

  it("allow-all：一律放行", () => {
    expect(照这一档("allow-all", 风险)).toBeUndefined()
  })

  it("deny-risky：拦下，并把理由交给模型", () => {
    expect(照这一档("deny-risky", 风险)).toBe(风险?.说明)
  })

  it("**没踩到风险的调用，哪一档都放行**", () => {
    expect(照这一档("deny-risky", undefined)).toBeUndefined()
  })
})

describe("造门 · 档位是取的，不是传的", () => {
  /**
   * 门在建会话时装上去，而档位在会话中途可以改。
   * **传值的话改完要等下次建会话才生效**——那就是
   * 「设置里改了、界面上没反应」的经典形状。
   */
  it("改完档位，同一个门立刻按新档判", () => {
    let 档: "allow-all" | "deny-risky" = "allow-all"
    const 门 = 造门(() => 档)
    const 参数 = { path: "data/raw/a.csv", content: "x" }

    expect(门("write", 参数, 本地), "全放行这一档不该拦").toBeUndefined()
    档 = "deny-risky"
    expect(门("write", 参数, 本地), "改了档位却还按老档判").toBeTruthy()
  })
})

describe("已知缺口：不认识的工具一律放行", () => {
  /**
   * **这是刻意的，也是有代价的**：子 agent 与 MCP 带进来的工具都不在
   * 那四个名字里，于是它们不受这道门管。
   *
   * 默认拒绝会让「加一个工具」变成「悄悄坏掉一个功能」，而我们现在还没有能力
   * 说清每一个外来工具在干什么。**把缺口钉成用例**，它就不会被忘掉——
   * 哪天补上了，这条会红，那正是提醒。
   */
  it("subagent / MCP 工具目前不受管", () => {
    expect(看风险("subagent", { prompt: "去把 data/raw 删了" }, 本地)).toBeUndefined()
  })
})

describe("造门 · 按会话定档（2026-08-22，定时任务）", () => {
  it("门把语境里的 sessionId 交给取档；定时的会话按自己的档，别的跟全局", () => {
    const 按会话 = new Map<string, "allow-all" | "deny-risky">([["定时的", "deny-risky"]])
    const 门 = 造门((sid) => (sid && 按会话.get(sid)) || "allow-all")
    const 参数 = { path: "data/raw/a.csv", content: "x" }
    expect(门("write", 参数, { ...本地, sessionId: "定时的" })).toBeTruthy()
    expect(门("write", 参数, { ...本地, sessionId: "普通的" })).toBeUndefined()
    expect(门("write", 参数, 本地)).toBeUndefined()
  })
})
