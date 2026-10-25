import { test, expect } from "./fixtures.js"

// 与 dev:mock 共用 SSH 夹具。延迟握手，可靠停在启动和取消之间。
test.use({ dawnOptions: { fakeSsh: true, env: { DAWN_FAKE_SSH_READY_DELAY_MS: "1200" } } })

for (const reconnect of [false, true]) {
  test(reconnect ? "握手取消后立即重连，旧结束不覆盖新连接" : "握手取消后保持未连接，原请求立即结束", async ({ dawn }) => {
    const { page } = dawn
    const id = await page.evaluate(async () => {
      const r = await window.dawn!.invoke("saveConnection", { label: "启动取消验收", host: "fake.example", username: "dawn", secret: "dawn" })
      if (!r.ok) throw new Error(JSON.stringify(r.error))
      return (r.data as { id: string }).id
    })
    // 夹具经 IPC 保存；重载让 UI 经正常启动读取新名单，再从真实入口开始连接。
    await page.reload()
    const head = page.getByRole("button", { name: /^服务器/ })
    if (await head.getAttribute("aria-expanded") !== "true") await head.click()
    const row = page.locator(".remote-row").filter({ hasText: "启动取消验收" })
    await expect(row).toHaveAttribute("data-state", "idle")
    await page.evaluate(id => { (window as any).pendingSsh = window.dawn!.invoke("connectRemote", { id }) }, id)
    await expect(row).toHaveAttribute("data-state", "connecting")
    await page.evaluate(async ({ id, reconnect }) => {
      const r = await window.dawn!.invoke("disconnectRemote", { id })
      if (!r.ok) throw new Error(JSON.stringify(r.error))
      const old = await (window as any).pendingSsh
      if (!old.ok) throw new Error(JSON.stringify(old.error))
      if (reconnect) {
        ;(window as any).pendingSsh = window.dawn!.invoke("connectRemote", { id })
      }
    }, { id, reconnect })
    if (reconnect) {
      const current = await page.evaluate(async () => (window as any).pendingSsh)
      expect(current.ok).toBe(true)
      expect(current.data.state.kind).toBe("ready")
      await expect(row).toHaveAttribute("data-state", "ready")
      await row.getByRole("button", { name: /管理服务器/ }).click()
      await row.getByRole("menuitem", { name: "断开", exact: true }).click()
    } else {
      // 超过夹具原握手时点后仍未恢复 ready：验证缺席事件需要跨过该时点。
      await page.waitForTimeout(1500)
    }
    await expect(row).toHaveAttribute("data-state", "idle")
    await expect(row.locator(".remote-reason")).toHaveCount(0)
  })
}
