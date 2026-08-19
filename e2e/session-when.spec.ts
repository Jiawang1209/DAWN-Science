/**
 * **会话行右端那一格：距离上一次对话多久了**（2026-08-19）。**跑真实构建产物。**
 *
 * 作者：*「我们现在的会话都是 alive 啥的，其实我们可以学习一下 Hermes，
 * 距离上一次对话是多久了。」*（附了 Hermes 那一列的截图：`14h` `23h` `2d` `7d` `9d`）
 *
 * ## 纯函数测试证明不了这一条
 *
 * `tests/ui/format.test.ts` 已经把 `多久之前` 的边界钉死了。它证明不了的是
 * **那个数从哪儿来**——这一整条路是：
 *
 *   `runs` 表 `MAX(COALESCE(finished_at, started_at))`
 *     → `ProjectManager.toSummary` 的 `lastActiveAt`
 *     → 协议 → 渲染进程 → 那一格文字
 *
 * 中间任何一环断掉，单测全绿而屏幕上是一列「刚刚」。
 * 所以这份用例**直接往账本里写几条不同年纪的 run**，再看侧栏怎么写。
 *
 * ## 为什么不是 `createdAt`
 *
 * 量过作者真实的库：一段 01:40 建的会话，**最后一次动作在 03:38**。
 * 照创建时刻显示会写「5 小时前」，而他 3 小时前还在跟它说话。
 * 下面「**同一段会话，建得早、聊得晚**」那一条盯的就是这个差别。
 */
import Database from "better-sqlite3"
import { test, expect, 开一段临时会话 } from "./fixtures.js"

const 秒 = 1000
const 时 = 60 * 60 * 秒
const 天 = 24 * 时

/**
 * 把这段会话名下的账**整体挪到某个时刻**。
 *
 * ## 第一版写成了「补一条旧账」，而它是错的
 *
 * 夹具刚说完一句话，那段会话名下**已经有一条此刻的 run**——
 * 而 `lastActiveAt` 取的是 `MAX`。再插一条 14 小时前的进去，
 * 最大值纹丝不动，屏幕上仍然是「刚刚」。
 * **用例当场红了，红得对**：它说的「14h」确实没出现。
 *
 * 要表达的是「这段会话最后一次动是在 N 小时前」，
 * 那就得把它全部的账都挪过去。
 *
 * **直接写库，不假装是 agent 干的**：让假模型真的等上 14 小时显然不可行。
 * 这不是绕过判据——「账写得对不对」由 `run-recorder.test.ts` 与那一堆
 * `readRuns` 的用例守着，**这一条守的是「界面怎么读它」**。
 */
function 把账挪到(dbPath: string, sessionId: string, 时刻: Date) {
  const db = new Database(dbPath)
  try {
    const iso = 时刻.toISOString()
    const r = db
      .prepare(
        `UPDATE runs SET started_at = ?, finished_at = ? WHERE session_id = ?`,
      )
      .run(iso, iso, sessionId)
    /**
     * 一条都没挪到就明说。**不静默跳过**——静默跳过的话这条用例会在
     * 「账本这条路彻底断了」时照样绿：那时侧栏退回创建时刻，
     * 而创建时刻恰好也很新，看起来一切正常。
     */
    if (r.changes === 0) throw new Error(`会话 ${sessionId} 名下一条 run 都没有，挪不了账`)
  } finally {
    db.close()
  }
}

/** 侧栏上第几行写着什么 */
const 那一格 = (page: import("@playwright/test").Page, 名: string | RegExp) =>
  page
    .locator(".session-list .sess-item")
    .filter({ has: page.locator(".sess .name").filter({ hasText: 名 }) })
    .locator(".sess-when")

test("**刚建出来的写「刚刚」**，不是 `0m`，也不是 `alive`", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "刚开的")

  await expect(那一格(page, "刚开的")).toHaveText("刚刚")
  /**
   * **`alive` 从屏幕上撤了。** 它几乎恒真（只意味着本进程里有个运行时），
   * 所以占着这一格是浪费——而作者要的正是这一格。
   *
   * 它没有消失，只是挪进了 `data-state`：视觉基线仍然靠它等
   * `starting → alive` 落定（见 `visual.spec.ts`）。
   */
  await expect(page.locator(".session-list .state")).toHaveCount(0)
  await expect(page.locator('.session-list .sess-item[data-state]')).toHaveCount(1)
})

test("**账上多久之前，行上就写多久之前**", async ({ dawn }) => {
  const { page, dbPath } = dawn
  await 开一段临时会话(page, "十四小时前那段")

  const id = await page.evaluate(() => {
    const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }
    return w.dawn.invoke("listTemporarySessions", {}).then((r) => {
      const list = r.data as { sessionId: string; title?: string }[]
      return list.find((s) => s.title === "十四小时前那段")?.sessionId
    })
  })
  expect(id, "找不到刚建的那段会话").toBeTruthy()

  把账挪到(dbPath, id!, new Date(Date.now() - 14 * 时))
  // **重载走真实的启动装配**：账要经过后端才会变成行上那个数
  await page.reload()

  await expect(那一格(page, "十四小时前那段")).toHaveText("14h")
})

/**
 * **同一段会话，建得早、聊得晚**——这一条是整轮改动的理由本身。
 *
 * 量过作者真实的库：一段 01:40 建的会话最后一次动作在 03:38。
 * 显示创建时刻会写「5 小时前」，而他 3 小时前还在跟它说话。
 */
test("**取最后一次动作，不是创建时刻**", async ({ dawn }) => {
  const { page, dbPath } = dawn
  await 开一段临时会话(page, "建得早聊得晚")

  const id = await page.evaluate(() => {
    const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }
    return w.dawn.invoke("listTemporarySessions", {}).then((r) => {
      const list = r.data as { sessionId: string; title?: string }[]
      return list.find((s) => s.title === "建得早聊得晚")?.sessionId
    })
  })

  // 三天前建的（改库里的 created_at），但**两小时前还聊过**
  const db = new Database(dbPath)
  db.prepare("UPDATE sessions SET created_at = ? WHERE id = ?").run(
    new Date(Date.now() - 3 * 天).toISOString(),
    id,
  )
  db.close()
  把账挪到(dbPath, id!, new Date(Date.now() - 2 * 时))
  await page.reload()

  await expect(
    那一格(page, "建得早聊得晚"),
    "写成了创建时刻——那正是这一轮要修的东西",
  ).toHaveText("2h")
})

/**
 * **一条账都没有的那些，如实退回创建时刻。**
 *
 * 量过：作者库里最近 12 段有 4 段是这样（建了没说过话）。
 * 这一格**不能空着**——一列时有时无的数字会让人以为程序坏了。
 */
test("**没说过话的退回创建时刻**，不是留白", async ({ dawn }) => {
  const { page, dbPath } = dawn
  await 开一段临时会话(page, "没说过话的")

  const id = await page.evaluate(() => {
    const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }
    return w.dawn.invoke("listTemporarySessions", {}).then((r) => {
      const list = r.data as { sessionId: string; title?: string }[]
      return list.find((s) => s.title === "没说过话的")?.sessionId
    })
  })

  const db = new Database(dbPath)
  // 账全删掉 + 创建时刻挪到五天前
  db.prepare("DELETE FROM runs WHERE session_id = ?").run(id)
  db.prepare("UPDATE sessions SET created_at = ? WHERE id = ?").run(
    new Date(Date.now() - 5 * 天).toISOString(),
    id,
  )
  db.close()
  await page.reload()

  await expect(那一格(page, "没说过话的")).toHaveText("5d")
})

/**
 * **正在等模型回话的那一段，那一格换成「跑着」**（作者选的形状）。
 *
 * 他选的是*「换成时间，但『正在跑』要看得见」*，而不是「彻底只留时间」。
 * 理由写在选项里：`alive` 几乎恒真（只意味着本进程里有个运行时）所以是噪声，
 * 但**「它正在干活」是你切走了也想知道的事**——远端长任务尤其。
 *
 * ## 这条只能在真实产物上验
 *
 * 那个标记的数据来自**推送流**（`App.tsx` 的订阅），不是账本里的
 * `status = 'running'`。选推送流的理由是：**落了盘的 `running` 在崩过一次之后
 * 会永远停在那儿**，于是侧栏显示一堆根本没在跑的东西——而那种谎最难发现。
 * 推送流则天然是对的：重启之后什么都没在跑，那就是实话。
 *
 * 而「推送流真的把别的会话的更新也送到了」这件事，单测证明不了：
 * 那条订阅在渲染进程里，中间隔着主进程的 webContents。
 */
test.describe("正在跑", () => {
  test.use({
    dawnOptions: {
      // **拖住这一轮**：不拖的话断言就变成了跟模型赛跑（同 `busy-gap.spec.ts`）
      toolCall: { toolName: "bash", args: { command: "sleep 5" }, say: "我先看看这里有什么。" },
    },
  })

  test("**跑起来那一格写「跑着」，跑完变回时间**", async ({ dawn }) => {
    const { page } = dawn
    /**
     * **建会话时不说话，那句话由这条用例自己发。**
     *
     * 第一版让夹具替它说了首句，然后自己再发一句——结果是
     * **抓到的「跑着」其实是夹具那一轮**，而假模型只在第一轮调工具，
     * 第二轮快到根本抓不住。用例于是红在「跑着没出现」上，
     * 而它其实出现过，只是不是我盯的那一轮。
     *
     * 这正是「夹具替用例说了一句话」那条老教训的又一种形状：
     * **夹具是搭台子的，要验的那个动作必须由用例自己做。**
     */
    await 开一段临时会话(page)

    const 格 = page.locator(".session-list .sess-when")
    // 一条账都没有，退回创建时刻——刚建出来就是「刚刚」
    await expect(格).toHaveText("刚刚")

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("看一下这个目录")
    await 框.press("Enter")

    /**
     * **跑起来了。** 颜色也要变——只靠一个词的话，色觉之外还有
     * 「一眼扫过去」这件事：这一列全是灰的数字，绿的那一个才跳得出来。
     */
    await expect(格, "开跑了，那一格还写着时间").toHaveText("跑着", { timeout: 30_000 })
    await expect(格).toHaveClass(/running/)

    /**
     * **跑完要变回去。** 只会变绿不会变回来的话，
     * 那个标记两天之后就永远亮着——比不显示更坏。
     */
    await expect(格, "跑完了还挂着「跑着」").not.toHaveText("跑着", { timeout: 60_000 })
    await expect(格).toHaveText("刚刚")
  })
})
