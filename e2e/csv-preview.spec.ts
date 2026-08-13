/**
 * 在 DAWN 里直接打开 csv，看见一张表（2026-08-14）。
 *
 * **这条就是这批改动的全部意义。** 作者的原话：*「我直接在 DAWN 里面打开 csv
 * 不行吗？」*——在此之前不行：`.csv` 落在 `text` 那一支上（`text/csv` 也是 `text/`），
 * 屏幕上是一坨逗号原文。
 *
 * 解析那一层有 22 条单元用例，**而它们全绿的同时这一屏可以什么都没变**——
 * 分支加在了 `text` 后面、界面没认这一支、协议把它拒了，任何一处断了都是这个结果。
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/** 一份**带引号里的逗号**的样本：那正是「看起来正常、其实错位」的那种数据 */
const 样本 = [
  "city,population,updated",
  '北京,21540000,2026-01-01',
  '"上海, 中国",24870000,2026-01-02',
  "广州,,2026-01-03",
].join("\n")

test("点开一个 csv → 出现一张表，而不是一坨逗号", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "data/raw"), { recursive: true })
  writeFileSync(join(workspace, "data/raw/cities.csv"), 样本, "utf8")

  await expect(page.locator(".app-shell")).toBeVisible()
  await 开一段临时会话(page)
  await page.getByRole("button", { name: "文件" }).click()

  // 展开到那个文件并点开
  await page.getByText("data", { exact: true }).click()
  await page.getByText("raw", { exact: true }).click()
  await page.getByText("cities.csv", { exact: true }).click()

  const 表 = page.locator(".table-preview")
  await expect(表, "打开 csv 没有出现表格——多半还在走 text 那一支").toBeVisible()

  // **摘要在最上面**：人的第一个问题是「多大、有哪些列」
  await expect(表.locator(".table-summary")).toContainText("3 行 × 3 列")

  // 列名与推断出来的类型
  await expect(表.getByText("population")).toBeVisible()
  await expect(表.locator(".col-type").first()).toContainText("推断")

  /**
   * **引号里的逗号没有被切开。**
   * 切开的话这一行会错位成四格，而屏幕上看起来仍然是一张正常的表——
   * 这类错不报任何异常，只会让人读到错的数。
   */
  await expect(表.getByText("上海, 中国")).toBeVisible()

  // 缺失要标出来：广州那行的 population 是空的
  await expect(表.locator(".col-missing")).toContainText("缺 1")
})

test("**原文不再当作表格的替代品** —— 打开 csv 不该看到一坨逗号", async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "x.csv"), 样本, "utf8")

  await expect(page.locator(".app-shell")).toBeVisible()
  await 开一段临时会话(page)
  await page.getByRole("button", { name: "文件" }).click()
  await page.getByText("x.csv", { exact: true }).click()

  await expect(page.locator(".table-preview")).toBeVisible()
  // 走 text 那一支的话，这里会是一个 <pre> 装着原文
  await expect(page.locator(".preview-text")).toHaveCount(0)
})
