/**
 * 全新安装写出的默认配置**不摆任何 native agent**（2026-08-10）。
 *
 * 作者：*「我们如果之前没有配置任何 API key 的时候，其实不一定要默认就设置
 * deepseek，因为给人一种我们只能配置 deepseek 的错觉感。」*
 *
 * **他是对的——默认摆哪一家，就是在替用户选。** 而「填了 key 就自动有 agent」
 * 之后它也不再必要：到设置里给任意一个 provider 填 key，它就出现在选择器里。
 *
 * 这条用例**刻意不让夹具补 agent**，走的是发布出去的那一份。
 */
import { test, expect } from "./fixtures.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_CONFIG_YAML } from "../src/config/loader.js"

test.describe("全新安装", () => {
  // 显式用发布的那份默认配置——**不是夹具补过的那份**
  test.use({ dawnOptions: { providersYaml: DEFAULT_CONFIG_YAML } })

  test("**默认配置里没有 deepseek**，也没有任何 native agent", async ({ dawn }) => {
    const { dir } = dawn
    const yaml = readFileSync(join(dir, "providers.yaml"), "utf8")
    /**
     * **只看没被注释掉的行**：文件里有注释掉的示例，
     * 粗暴地 `not.toContain` 会把说明文档也当成配置。
     */
    const 生效的 = yaml
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n")
    expect(生效的).not.toContain("kind: native")
    // 不需要 key 的那几个仍然在——装了 claude/codex 的人开箱即用
    expect(yaml).toContain("shell:")
    expect(yaml).toContain("claude:")
  })

  test("**首屏不摆一个用不了的 agent**，而是指路去设置", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    // 选择器里不该出现 deepseek 相关的东西
    await expect(page.locator(".sidebar")).not.toContainText("ds-chat")
    // 底部那条提示仍在，它是通往设置的路
    await expect(page.locator(".app-shell")).toContainText("设置")
  })
})
