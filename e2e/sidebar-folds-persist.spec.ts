/**
 * 侧栏各组的收起 / 展开跨重启记着（2026-09-28 作者要的）。**跑真实构建产物。**
 *
 * 作者：每次打开，「服务器」那组连同机器都摊开着——收起来，重开又弹开。
 * 定案：*「记住你的收起 / 展开状态，服务器下的机器默认也按照状态进行」*——只加记忆，默认值不改。
 *
 * 机器那一行要连一台服务器才有，夹具里没有；它与「项目」「最近」走的是同一个集合、同一个 key
 * （`state/sidebar.ts` 的 `读收起的组`，单测 `sidebar-groups-persist.test.ts` 钉着），这里用「项目」组与项目文件夹（两个 key 各验一个）走真链路。
 * `page.reload()` 等于重开渲染进程：组件的 state 全没了，只剩存储。
 */
import { test, expect, 在项目里开会话 } from "./fixtures.js"

test("**收起装着当前会话的文件夹、再收起「项目」，重新加载之后都还收着**", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)

  const 项目 = page
    .locator(".side-section-toggle")
    .filter({ has: page.locator(".side-section-title", { hasText: /^项目$/ }) })
  const 文件夹 = page.locator(".proj-list .proj-item").first()
  const 文件夹里的会话 = page.locator(".proj-session-list")

  // 没表达过偏好时的默认（本次改动不许改它）：「项目」摊开；装着当前会话的文件夹自动展开
  await expect(项目).toHaveAttribute("aria-expanded", "true")
  await expect(文件夹里的会话).toHaveCount(1)

  // ① 文件夹：切一下，重新加载之后得保持切过的样子。
  //    **不预设重新加载后它该开还是关**：重载后当前会话可能没选回来，那时「自动展开」本来就不发生——
  //    第一版写死「收起→重载→还收着」，没修也绿（反向验过才发现）。所以每轮先读它此刻的样子再切。
  for (const _ of [1, 2]) {
    await page.reload()
    await expect(文件夹).toBeVisible({ timeout: 30_000 })
    const 之前开着 = (await 文件夹里的会话.count()) > 0
    await 文件夹.locator(".proj-head .row").click()
    await expect(文件夹里的会话).toHaveCount(之前开着 ? 0 : 1)
    await page.reload()
    await expect(文件夹).toBeVisible({ timeout: 30_000 })
    await expect(文件夹里的会话, "文件夹的开 / 关重载后没记住").toHaveCount(之前开着 ? 0 : 1)
  }

  // ② 整个「项目」组
  await 项目.click()
  await expect(项目).toHaveAttribute("aria-expanded", "false")
  await expect(文件夹).toHaveCount(0)
  await page.reload()
  await expect(项目).toHaveAttribute("aria-expanded", "false", { timeout: 30_000 })
  await expect(文件夹).toHaveCount(0)

  // 再展开回来，也记得
  await 项目.click()
  await page.reload()
  await expect(项目).toHaveAttribute("aria-expanded", "true", { timeout: 30_000 })
})
