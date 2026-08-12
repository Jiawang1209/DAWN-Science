/**
 * 在界面上添加一个模型服务，**从头到能对话**（2026-08-10）。**跑真实构建产物。**
 *
 * 作者：*「一个「添加」入口，二选一（从 pi 的列表里选 → 只问 key；
 * 自定义端点 → 名字/baseUrl/api/models/key）。」*
 *
 * ## 这条用例串起来的那条链
 *
 * 界面填表 → `setProviderConnection` → `providers.yaml` → 重新生成
 * `models.json` → pi 的模型目录失效重取 → **自动有一个同名 agent** →
 * 模型选择器里出现 → 建会话 → 真的打到我填的那个地址上。
 *
 * **中间断任何一环，症状都是「我配好了但用不上」**——那句话作者今天说过三次，
 * 每次背后是不同的一环。所以这一条不拆：它验的就是「整条」。
 *
 * 顺带证明：**自建的 vLLM / Ollama / 任何 OpenAI 兼容端点**走的是同一条路。
 */
import { test, expect, CANNED_REPLY, 开一段临时会话 } from "./fixtures.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

test("**填完就能用**：自定义端点 → 模型选择器 → 真的连上了", async ({ dawn }) => {
  const { page, dir, mockUrl, requests } = dawn

  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByRole("radio", { name: "自定义端点" }).click()

  await page.getByLabel("新服务的名字").fill("mine")
  await page.getByLabel("新服务的端点地址").fill(mockUrl)
  await page.getByLabel("新服务的模型清单").fill("my-7b")
  /**
   * **key 也得填，哪怕这个假端点根本不看它。**
   *
   * 这条约束是**在真实产物上验出来的**：留空之后 pi 直接拒绝调用，
   * 报 `No API key found for mine`。界面上那句「本地端点常常不需要，留空即可」
   * 是我想当然写的——现在它写的是实情，并告诉人随便填一个值即可。
   */
  await page.getByLabel("新服务的 API key").fill("local")
  await page.getByRole("button", { name: "加进来" }).click()

  // 一行摘要立刻报出三件事
  const 行 = page.locator(".svc").filter({ hasText: "mine" })
  await expect(行.locator(".svc-sum")).toContainText("1 个模型")
  await expect(行.locator(".svc-sum")).toContainText("已填 key")

  // 真的落到配置文件里了
  const yaml = readFileSync(join(dir, "providers.yaml"), "utf8")
  expect(yaml).toContain("mine:")
  expect(yaml).toContain("my-7b")

  /**
   * **建一个用它的会话。**
   *
   * 新建会话默认用列表里的第一个 agent（夹具补的 `ds-chat`），
   * 所以要从 agent 菜单里显式挑 `mine`——**它出现在那个菜单里本身就是要验的东西**：
   * 我们从来没点过任何「建 agent」，填完表它自己就在了。
   */
  await page.getByRole("button", { name: "返回" }).click()
  await 开一段临时会话(page)
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

  await page.locator(".agent-pill").click()
  /**
   * **走「就地换服务」那一组**（2026-08-11 改）。
   *
   * 此前这里点的是「新建会话，用哪个 LLM」那一组里的同名项。
   * 那一组现在不再重复列出**能就地换过去**的服务——作者报过
   * *「同一个对话，我切换模型，依旧会弹出新的对话」*：
   * 同一家在两组里各出现一次，而人是照着「换 LLM」几个字点的。
   *
   * 换成上组之后，这条用例验的东西反而更强了：
   * 新加的服务不仅**能用**，而且是**在同一段对话里**用上的。
   */
  await page.locator(".agent-menu .svc-group").getByRole("menuitem", { name: "mine" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  // 模型格上是我们声明的那个 id——不是某个内置 provider 顶了包
  await expect(page.locator(".composer")).toContainText("my-7b")

  await page.getByPlaceholder(/回车发送/).fill("你好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText(CANNED_REPLY, { timeout: 60_000 })

  // **反空转**：请求真的用了我填的那个模型 id，不是某个内置 provider 顶了包
  expect(JSON.stringify(requests)).toContain("my-7b")
})

test("**名字不合法当场就说** —— 而不是写进 yaml 之后炸", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByRole("radio", { name: "自定义端点" }).click()

  await page.getByLabel("新服务的名字").fill("我的 端点")
  await page.getByRole("button", { name: "加进来" }).click()
  await expect(page.locator(".svc-add")).toContainText("只能用小写字母")
})

test("**移除一个服务：配置里那一段真的没了**", async ({ dawn }) => {
  const { page, dir } = dawn
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: /添加模型服务/ }).click()
  await page.getByRole("radio", { name: "自定义端点" }).click()
  await page.getByLabel("新服务的名字").fill("tmp")
  await page.getByLabel("新服务的端点地址").fill("http://127.0.0.1:9/v1")
  await page.getByLabel("新服务的模型清单").fill("x")
  await page.getByLabel("新服务的 API key").fill("local")
  await page.getByRole("button", { name: "加进来" }).click()

  const 行 = page.locator(".svc").filter({ hasText: "tmp" })
  await expect(行).toHaveCount(1)
  expect(readFileSync(join(dir, "providers.yaml"), "utf8")).toContain("tmp:")

  await 行.getByRole("button", { name: "移除这个服务" }).click()
  await expect(page.locator(".svc").filter({ hasText: "tmp" })).toHaveCount(0)
  expect(readFileSync(join(dir, "providers.yaml"), "utf8")).not.toContain("tmp:")
})
