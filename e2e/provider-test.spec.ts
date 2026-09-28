/**
 * 模型服务的三件事（2026-09-28 作者一次提的）。**跑真实构建产物。**
 *
 *   1. *「添加模型的时候，其实应该有一个测试按钮，测试 API 是否是通的」*——「测试连通」（协议 8.7）；
 *   2. *「添加完 API 之后，报错了还要弹出来」*——保存后自动验证**确定没过**就弹框（没能判定不弹）；
 *   3. *「移除模型按钮，也不能立刻移除」*——只填了 key 的那家，填 key 时后端自动造的 agent 删 key 时没收回。
 *
 * 用 `groq`：pi 认识、默认没配、夹具把它的地址盖到了假服务器上（e2e 不碰外网）。
 * 假服务器认一把「坏 key」：key 里带 `bad` 的那一问 key 验证回 401（`scripts/mock-inference-server.mjs`，dev:mock 同一处）。
 */
import { test, expect, 进设置 } from "./fixtures.js"
import type { Page } from "@playwright/test"

async function 开添加挑groq(page: Page) {
  await 进设置(page, "模型服务")
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByLabel("筛选 provider").fill("groq")
  await page.getByLabel("pi 认识的 provider").selectOption("groq")
}

test("**测试连通**：坏 key 说 key 不对；改了 key 旧结论撤掉；好 key 说通了、带模型名；测试不落盘", async ({ dawn }) => {
  const { page } = dawn
  await 开添加挑groq(page)
  const key = page.getByLabel("新服务的 API key")
  const 测 = page.getByRole("button", { name: "测试连通" })

  await key.fill("sk-bad-one")
  await 测.click()
  const 结论 = page.locator(".svc-test [role=status]")
  await expect(结论).toContainText("Incorrect API key")
  await expect(结论).toHaveClass(/caveat/)

  await key.fill("sk-good-one")
  await expect(结论).toHaveCount(0)
  await 测.click()
  // 带着真用的那个模型名（目录第一个——pi 把夹具的 groq 与它内置的 groq 合在一起，第一个是内置的；与保存后自动验证挑的是同一个）
  await expect(结论).toHaveText(/✓ 通了 · \S+ · [\d.]+ 秒/)

  // 只是测：没加进来，已配置那一列里没有 groq
  await page.getByRole("button", { name: "收起添加模型服务" }).click()
  await expect(page.locator(".svc").filter({ hasText: "groq" })).toHaveCount(0)
})

test("**测试连通**：没填 key 就点，当场说缺什么，不发请求", async ({ dawn }) => {
  const { page } = dawn
  await 开添加挑groq(page)
  const 之前 = dawn.keyChecks.length
  await page.getByRole("button", { name: "测试连通" }).click()
  await expect(page.locator(".svc-test [role=status]")).toContainText("需要填 key")
  expect(dawn.keyChecks.length).toBe(之前)
})

test("**保存了一把坏 key：弹出来**，「知道了」关掉；那一行照旧留着红字", async ({ dawn }) => {
  const { page } = dawn
  await 开添加挑groq(page)
  await page.getByLabel("新服务的 API key").fill("sk-bad-saved")
  await page.getByRole("button", { name: "加进来" }).click()

  const 框 = page.getByRole("alertdialog", { name: "groq 的 key 没通过验证" })
  await expect(框).toBeVisible({ timeout: 15_000 })
  await expect(框).toContainText("Incorrect API key")
  await 框.getByRole("button", { name: "知道了" }).click()
  await expect(框).toHaveCount(0)
  await expect(page.locator(".svc").filter({ hasText: "groq" }).locator(".caveat")).toContainText("Incorrect API key")
})

test("**保存了一把好 key：不弹**", async ({ dawn }) => {
  const { page } = dawn
  await 开添加挑groq(page)
  await page.getByLabel("新服务的 API key").fill("sk-good-saved")
  await page.getByRole("button", { name: "加进来" }).click()
  await expect.poll(() => dawn.keyChecks.length).toBeGreaterThan(0)
  await expect(page.locator(".svc").filter({ hasText: "groq" })).toHaveCount(1)
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
})

test("**只填了 key 的那家，「移除这个服务」立刻从列表里下去**（不用重启）", async ({ dawn }) => {
  const { page } = dawn
  await 开添加挑groq(page)
  await page.getByLabel("新服务的 API key").fill("sk-good-remove")
  await page.getByRole("button", { name: "加进来" }).click()
  const 行 = page.locator(".svc").filter({ hasText: "groq" })
  await expect(行).toHaveCount(1)

  await 行.getByRole("button", { name: "移除这个服务" }).click()
  await expect(行).toHaveCount(0)
})

test("**自定义端点也能测**：还没保存、不在运行时里，照表单现拼一个模型直接发", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "模型服务")
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByRole("radio", { name: "自定义端点" }).click()
  await page.getByLabel("新服务的名字").fill("mine")
  await page.getByLabel("新服务的端点地址").fill(dawn.mockUrl)
  await page.getByLabel("新服务的模型清单").fill("m-one, m-two")
  const key = page.getByLabel("新服务的 API key")
  const 测 = page.getByRole("button", { name: "测试连通" })
  const 结论 = page.locator(".svc-test [role=status]")

  await key.fill("anything")
  await 测.click()
  // 测的是清单里第一个
  await expect(结论).toHaveText(/✓ 通了 · m-one · /)

  await key.fill("sk-bad-custom")
  await 测.click()
  await expect(结论).toContainText("Incorrect API key")
})

/**
 * **只收某个 temperature 的模型，验 key 不能被参数挡住**（2026-09-28 作者撞的：moonshotai-cn 保存后写着
 * 「没能验证 moonshotai-cn 的 key（invalid temperature: only 0.6 is allowed for this model）——可能是网络」）。
 * 验 key 那一问此前固定带 `temperature: 0`；现在不带，用服务商自己的默认。假服务器学了 Kimi 的这个脾气。
 */
test("**只收 temperature 0.6 的模型（Kimi）**：测试连通照样通，不被参数挡住", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "模型服务")
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByRole("radio", { name: "自定义端点" }).click()
  await page.getByLabel("新服务的名字").fill("kimi-like")
  await page.getByLabel("新服务的端点地址").fill(dawn.mockUrl)
  await page.getByLabel("新服务的模型清单").fill("kimi-k2.6")
  await page.getByLabel("新服务的 API key").fill("sk-good")
  await page.getByRole("button", { name: "测试连通" }).click()
  await expect(page.locator(".svc-test [role=status]")).toHaveText(/✓ 通了 · kimi-k2\.6 · /)

  // 保存后那次自动验证也不许被挡：行下没有「没能验证」那句
  await page.getByRole("button", { name: "加进来" }).click()
  await expect.poll(() => dawn.keyChecks.length).toBeGreaterThan(1)
  const 行 = page.locator(".svc").filter({ hasText: "kimi-like" })
  await expect(行).toHaveCount(1)
  await expect(行).not.toContainText("没能验证")
})
