/**
 * 远端内核在装配层的那几处接线（远程内核，审查 2026-09-04）。
 *
 * **与 `wiring.test.ts` 分开一个文件**：那份正在被任务 9 改，而这几条是任务 8 的收尾。
 */
import { describe, expect, it } from "vitest"
import { 没探明白后缀, 选定 } from "../../src/remote/interpreters.js"
import { KERNEL_PACKAGE } from "../../src/protocol/kernel-package.js"

/**
 * 「一条都没有」那句话（`interpreterOf` 的 none 分支）。
 *
 * 它长在 `wiring.ts` 里、要一台真服务器才走得到，所以判据抽在 `没探明白后缀` 上，
 * 这里按 wiring 拼它的同一种方式拼一遍，盯住**那条路径必须出现在话里**。
 */
describe("没配解释器又一条都没探到时说的那句话", () => {
  const 那句话 = (unknown: { path: string; problem?: string }[]) =>
    `gs191 上没有装了 ipykernel 的 Python。装法：${KERNEL_PACKAGE.python.how}。装好后再试${没探明白后缀(unknown)}`

  it("干干净净一条都没有 → 不多说一个字", () => {
    expect(那句话([])).toBe(`gs191 上没有装了 ipykernel 的 Python。装法：${KERNEL_PACKAGE.python.how}。装好后再试`)
  })

  /**
   * **「没有」与「没探明白」要分开说**。八秒没应答的那条 python 很可能装着 ipykernel，
   * 只是它自己起不来——把人支去 `pip install` 是让他修一个没坏的东西。
   */
  it("有没探明白的 → 路径与原因都要出现，人才知道去看哪条", () => {
    const 话 = 那句话([{ path: "/opt/py/bin/python", problem: "8 秒没应答" }])
    expect(话).toContain("另有 1 条没探明白")
    expect(话).toContain("/opt/py/bin/python")
    expect(话).toContain("8 秒没应答")
  })

  it("说不出原因也要把路径说出来——「原因不明」仍然比只字不提有用", () => {
    expect(那句话([{ path: "/usr/bin/python3" }])).toContain("/usr/bin/python3（原因不明）")
  })

  /** `选定` 与这句话是同一件事的两半：它挑出来的那几条，正是这里要念出来的 */
  it("`选定` 交出来的 unknown 直接就能喂给它", () => {
    const 定 = 选定([
      { path: "/a", source: "PATH" as const, kernelPackage: "missing" as const },
      { path: "/b", source: "PATH" as const, kernelPackage: "unknown" as const, problem: "退出码 2" },
    ])
    expect(定.kind).toBe("none")
    expect(没探明白后缀(定.kind === "none" ? 定.unknown : [])).toContain("/b（退出码 2）")
  })
})

/**
 * 扫残留与起内核抢同一个装机 id（审查 2026-09-04 抓的）。
 *
 * `扫残留` 的 `pkill -9 -f '[d]awn-<装机id>-.*\.json'` 分不出「上次留下的」与「这一秒刚起的」，
 * 所以 `interpreterOf` 里加了一句 `await 扫过.get(cid)`。**要真验它得有一台会起内核的假服务器**
 * （任务 9 的 `fake-ssh-kernel.ts`），现在还没有——写下来的判据比记在脑子里的多活一天。
 */
describe("连上就跑：扫残留不该杀掉刚起的那一台", () => {
  // 1. 假 SSH 加一台、连上（`onState` 的 ready 分支会把扫残留挂进 `扫过`）
  // 2. 让那台假服务器的 `扫残留` 那条 exec 挂住几百毫秒
  // 3. 立刻 runInKernel：断言那条 pkill 在内核起来**之前**就已经跑完
  //    （观察点是假服务器收到的命令顺序）
  it.todo("扫完了才起内核，起来的那一台不会被自己人杀掉")
})
