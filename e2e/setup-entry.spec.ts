import { test, expect } from "./fixtures.js"
import type { Page } from "@playwright/test"

async function legacySkip(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("dawn.global.setupSkipped", "1")
    localStorage.removeItem("dawn.global.onboardingDone")
  })
  await page.reload()
}

test.describe("无模型的首次引导入口", () => {
  test.use({ dawnOptions: { showSetup: true, providersYaml: "agents: {}\n" } })

  test("旧跳过标记不能掩盖新引导；新版主动跳过后不反复弹出，并可从首页重新进入", async ({ dawn }) => {
    const { page } = dawn
    await legacySkip(page)
    const wizard = page.locator(".setup-wizard")
    await expect(wizard.getByRole("heading", { name: "欢迎使用 DAWN Science" })).toBeVisible({ timeout: 4000 })
    await expect(page.getByText("还没有可用的 agent", { exact: true })).toHaveCount(0)
    await page.screenshot({ path: "artifacts/setup-entry-2026-10-31/legacy-reopened.png" })
    await wizard.getByRole("button", { name: "下一页", exact: true }).click()
    await wizard.getByRole("button", { name: "下一页", exact: true }).click()
    await wizard.getByRole("button", { name: "稍后配置", exact: true }).click()
    await wizard.getByRole("button", { name: "跳过，进入工作台", exact: true }).click()
    await expect(wizard).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole("button", { name: "开始设置", exact: true })).toBeVisible()
    await expect(wizard).toHaveCount(0)
    await expect(page.getByText("还没有可用的 agent", { exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "开始设置", exact: true }).click()
    await expect(wizard.getByRole("heading", { name: "欢迎使用 DAWN Science" })).toBeVisible()
    await expect(page.locator(".settings")).toHaveCount(0)
  })
})

test.describe("已有可用模型的兼容入口", () => {
  test.use({ dawnOptions: { showSetup: true } })
  test("旧跳过标记加可用模型时保留工作台，不强制重新引导", async ({ dawn }) => {
    await legacySkip(dawn.page)
    await expect(dawn.page.locator(".composer-field")).toBeVisible()
    await expect(dawn.page.locator(".setup-wizard")).toHaveCount(0)
  })
})
