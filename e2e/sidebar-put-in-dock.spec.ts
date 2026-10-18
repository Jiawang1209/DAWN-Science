import { test, expect, 在项目里开会话 } from "./fixtures.js"

test("侧栏入坞保留唯一主区，支持非当前入坞及当前与坞对调", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const tabs = page.getByRole("tablist", { name: "同一处的会话" })
  const firstId = await tabs.getByRole("tab", { selected: true }).getAttribute("data-session")
  const rows = page.locator(".proj-session-list .sess-item")
  await rows.first().click({ button: "right" })
  await page.getByRole("menuitem", { name: "放进坞里", exact: true }).click()
  await expect(page.getByText("这里只有这一段，放进坞里主区就空了", { exact: true })).toBeVisible()
  await expect(tabs.getByRole("tab", { selected: true })).toHaveAttribute("data-session", firstId!)
  await tabs.getByRole("tab", { selected: true }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click()
  const rename = tabs.getByRole("textbox")
  await rename.fill("侧栏保留主区")
  await rename.press("Enter")
  await expect(tabs.getByRole("tab", { name: "侧栏保留主区", exact: true })).toBeVisible()
  await tabs.getByRole("button", { name: "在这里再开一段" }).click()
  await expect(tabs.getByRole("tab")).toHaveCount(2)
  await expect(tabs.getByRole("tab", { selected: true })).not.toHaveAttribute("data-session", firstId!)
  const secondId = await tabs.getByRole("tab", { selected: true }).getAttribute("data-session")
  await rows.filter({ hasText: "侧栏保留主区" }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "放进坞里", exact: true }).click()
  await expect(page.locator(".side-chat-head")).toBeVisible()
  await expect(tabs.getByRole("tab", { selected: true })).toHaveAttribute("data-session", secondId!)
  await expect(tabs.locator('[data-in-dock="1"] .session-tab')).toHaveAttribute("data-session", firstId!)
  await rows.filter({ hasText: "新会话" }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "放进坞里", exact: true }).click()
  await expect(tabs.getByRole("tab", { selected: true })).toHaveAttribute("data-session", firstId!)
  await expect(tabs.locator('[data-in-dock="1"] .session-tab')).toHaveAttribute("data-session", secondId!)
})

test("从项目右键另一组临时会话入坞，主区与坞都切到目标组", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.evaluate(async () => {
    const invoke = (window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<unknown> } }).dawn.invoke
    const providers = await invoke("getProviders", {}) as { data: { agents: { agentId: string }[] } }
    const agentId = providers.data.agents[0]?.agentId
    if (!agentId) throw new Error("验收夹具没有可用的 agent")
    for (const title of ["临时主区验收", "临时入坞验收"]) {
      const created = await invoke("createTask", { agentId }) as { data: { sessionId: string } }
      await invoke("renameSession", { sessionId: created.data.sessionId, title })
    }
  })
  await page.reload()
  await page.locator(".proj-session-list .sess-item").first().locator(".row").first().click()
  await expect(page.getByRole("tablist", { name: "同一处的会话" })).toBeVisible()
  const target = page.locator(".sidebar .sess-item").filter({ hasText: "临时入坞验收" })
  await target.click({ button: "right" })
  await page.getByRole("menuitem", { name: "放进坞里", exact: true }).click()
  await expect(page.locator(".side-chat-title")).toHaveText("临时入坞验收")
  await expect(page.locator(".sidebar .sess-item.current .sess-title-run")).toHaveText("临时主区验收")
})
