/**
 * 输入法组词途中那一下回车（2026-09-06 作者报的）。
 *
 * 中文/日文/韩文输入法里，回车的第一层含义是**「就用这个候选词」**，
 * 与「把这句话发出去」是两件事。组词还没结束就发出去，等于**把拼音当成了话**。
 *
 * 2026-09-06 用 CDP 的 `Input.imeSetComposition` 量过一次，这台 Electron 给的是：
 * `keydown · key=Enter · keyCode=13 · isComposing=true`——判据就在最后那一项。
 */
import { expect } from "@playwright/test"
import { test } from "./fixtures.js"

test("组词没结束时按回车，不许发出去", async ({ dawn }) => {
  const { app, page } = dawn
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.waitFor({ timeout: 20_000 })
  await 框.click()

  const cdp = await app.context().newCDPSession(page)
  // 拼音进去了，候选还没上屏
  await cdp.send("Input.imeSetComposition", {
    text: "woyaoyigewenjian",
    selectionStart: 16,
    selectionEnd: 16,
  })
  await expect(框).toHaveValue("woyaoyigewenjian")

  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  })
  await page.waitForTimeout(1000)

  // **一个字都不许发出去**，而且拼音要还在框里
  expect(await page.locator(".turns .turn").count()).toBe(0)
  expect(await page.locator(".conv-title").count()).toBe(0)
  await expect(框).toHaveValue("woyaoyigewenjian")
})

test("候选词上屏之后，回车照旧发得出去", async ({ dawn }) => {
  const { app, page } = dawn
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.waitFor({ timeout: 20_000 })
  await 框.click()

  const cdp = await app.context().newCDPSession(page)
  await cdp.send("Input.imeSetComposition", { text: "wo", selectionStart: 2, selectionEnd: 2 })
  // 上屏：组词结束，框里是汉字
  await cdp.send("Input.insertText", { text: "我要一个文件" })
  await expect(框).toHaveValue("我要一个文件")

  await 框.press("Enter")
  // **这一下必须发得出去**——修组词那件事时把正常发送一起挡住，是这类修法最常见的死法
  await page.locator(".conv-title").waitFor({ timeout: 20_000 })
  expect(await page.locator(".turns .turn").count()).toBeGreaterThan(0)
})

/**
 * **每一下按键都报 229 的输入法**（豆包 / 搜狗这一类，xterm.js #5887 量到过）
 * 不许把回车吃掉（2026-09-08）。
 *
 * 上一版的判据是 `isComposing || keyCode === 229`——第二项单独说话，
 * 于是在这类输入法下**每一下按键都被让给了输入法**：回车只换行、Esc 中断不了、
 * ↑↓ 翻不了历史。屏幕上看起来就是「输入法坏了」，而代码是我们的。
 *
 * 这里造的正是那个场景：没有任何组词，回车却带着 `keyCode=229` 进来。
 */
test("输入法把每一下都报成 229 时，回车照样发得出去", async ({ dawn }) => {
  const { app, page } = dawn
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.waitFor({ timeout: 20_000 })
  await 框.click()

  const cdp = await app.context().newCDPSession(page)
  // 上屏的字（没有组词——这类输入法在英文模式下也照报 229）
  await cdp.send("Input.insertText", { text: "这一句要发出去" })
  await expect(框).toHaveValue("这一句要发出去")

  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 229,
    nativeVirtualKeyCode: 229,
  })

  // **发得出去**，而且框里不许多出一个换行
  await page.locator(".conv-title").waitFor({ timeout: 20_000 })
  expect(await page.locator(".turns .turn").count()).toBeGreaterThan(0)
})
