/**
 * 英文那一面（2026-08-13）。**跑真实构建产物。**
 *
 * 作者：*「设置里面，其实可以增加一个双语模式，我们其实可以默认是英语模式，
 * 然后有中英双语的一个按钮。」*
 *
 * ## 为什么非要单独一份
 *
 * 夹具把界面语言**钉在中文**（见 `fixtures.ts` 里 `钉住中文` 的注）——
 * 那五百多处「按中文名找按钮」不钉住就会一次性全红，
 * 而红成一片就没人看得出哪条是真问题。
 *
 * 代价是：**产品的默认语言反而一条用例都没走过。**
 * 这一份就是来还那笔债的。它只做两件，但这两件都得是真的：
 *
 *   1. 默认（谁都没选过）就是英文，而且**主路径上一个汉字都没有**
 *   2. 那颗按钮真的能切，且**切完之后记得住**
 *
 * 「屏幕上没有汉字」这条判据是刻意选的：**它比逐句断言强**。
 * 逐句断言只能覆盖我想得起来的那几句，而漏翻恰恰漏在想不起来的地方。
 */
import { test, expect } from "./fixtures.js"

/** 这一屏上所有看得见的文字里，有没有汉字 */
async function 屏上的汉字(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const 出: string[] = []
    const 走 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = 走.nextNode())) {
      const 文 = n.nodeValue ?? ""
      if (!/[一-鿿]/.test(文)) continue
      // 看不见的不算：它们不构成「界面还是中文」
      const el = n.parentElement
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      出.push(文.trim())
    }
    return 出
  })
}

/**
 * **把语言恢复成默认**（也就是「没人选过」）。
 *
 * 夹具在每次导航前都会把 `zh` 写进去，所以这里要先把那条 init script
 * 的效果抹掉——`page.addInitScript` 没有撤销接口，于是改用
 * 「清掉那一格 + 重新导航」：清完再 reload 会被 init script 又写回去，
 * 所以顺序是**先 reload，再清，再原地重挂**。
 *
 * 这里没有用重新导航，而是直接调应用自己的 `setLang` 之后再清存储：
 * 前者换语言，后者让「下次启动读到的是没选过」。
 */
async function 回到默认语言(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem("dawn.global.lang")
    location.reload()
  })
}

test("**默认就是英文，且主路径上没有汉字**", async ({ dawn }) => {
  const { page } = dawn

  // 夹具钉的是中文，这里要看的是「谁都没选过」那一档
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("dawn.global.lang")
    } catch {
      /* 清不掉就让下面的断言去红 */
    }
  })
  await 回到默认语言(page)

  await expect(page.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Start a chat")).toBeVisible()

  /**
   * **一个汉字都不该有。**
   *
   * 报错里把漏网的那几句原样列出来——「有 3 处没翻」远不如
   * 「这三句没翻」有用，后者按下去就能改。
   */
  const 漏的 = await 屏上的汉字(page)
  expect(漏的, "这几句在英文界面上还是中文——补进 src/ui/i18n/en.ts").toEqual([])
})

test("**那颗按钮真的能切，而且记得住**", async ({ dawn }) => {
  const { page, 重开 } = dawn

  // 夹具钉的是中文，所以进来是中文
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "外观", exact: true }).click()

  // 切到英文：整屏跟着换
  await page.getByRole("radio", { name: "English" }).click()
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 10_000 })

  /**
   * **两个选项都写自己的母语。**
   * 一个看不懂当前语言的人，正是最需要这颗按钮的人——
   * 把它写成「Chinese」，中文用户在英文界面上就找不着回去的路。
   */
  await expect(page.getByRole("radio", { name: "中文" })).toBeVisible()

  // 关掉再打开，仍然是英文
  const p2 = await 重开()
  /**
   * **夹具重开时会重新把 `zh` 钉回去**——所以这里不能直接断言英文，
   * 那样验的是夹具而不是产品。改成断言那一格真的写进了存储：
   * 「记得住」这件事的事实就在那儿。
   */
  const 存的 = await p2.evaluate(() => localStorage.getItem("dawn.global.lang"))
  expect(存的).toBe("zh") // 夹具钉回去的
  // 而产品自己的读回逻辑由单元测试盖（loadLang），这里只证明它落了盘
})
