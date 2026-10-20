import { resolve } from "node:path"
import { mkdirSync } from "node:fs"
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

const fake = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")
test.use({ dawnOptions: { providersYaml: `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat, exec]
  claude-acp:
    kind: acp
    command: node
    args: ["${fake}"]
    capabilities: [chat, exec]
` } })

test("280px侧栏同时有模型、推理和适配器配置时，按钮不压扁且各菜单可用", async ({ dawn: { page } }) => {
  await page.evaluate(async () => {
    const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }
    const projects = (await w.dawn.invoke("listProjects", {})).data as { workspace: string }[]
    await w.dawn.invoke("createTask", { agentId: "claude-acp", workspace: projects[0]!.workspace })
  })
  await 在项目里开会话(page)
  await 进坞(page, "对话")
  const side = page.locator("aside.right-dock")
  await side.locator(".side-chat-pick").click()
  await expect(side.locator('.config-pill[data-config="thought_level"]')).toBeVisible()
  await side.evaluate(el => { el.style.width = "280px"; el.style.maxWidth = "280px" })
  const controls = side.locator('.composer-footer .model-trigger, .composer-footer .config-pill .sess-config-trigger, .composer-footer .send-btn, .composer-footer .perm-pill-trigger, .composer-footer .composer-status .sess-config-trigger')
  await expect(side.locator('.model-trigger')).toBeVisible()
  await expect.poll(() => side.locator('.model-trigger').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(70)
  const bounds = (await side.locator('.composer-card').boundingBox())!
  const boxes = await controls.evaluateAll(els => els.map(el => { const r=el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height } }))
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(bounds.x - 1)
    expect(b.x+b.width).toBeLessThanOrEqual(bounds.x+bounds.width+1)
  }
  for (let i=0;i<boxes.length;i++) for (let j=i+1;j<boxes.length;j++) {
    const a=boxes[i]!,b=boxes[j]!
    expect(a.x+a.width>b.x+1 && b.x+b.width>a.x+1 && a.y+a.height>b.y+1 && b.y+b.height>a.y+1).toBe(false)
  }
  await side.locator('.model-trigger').click()
  await expect(side.locator('.model-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await side.locator('.config-pill[data-config="thought_level"] .sess-config-trigger').click()
  await side.getByRole('menuitemradio', { name: '高', exact: true }).click()
  await expect(side.locator('.config-pill[data-config="thought_level"] .sess-config-trigger')).toContainText('高')
  await page.keyboard.press('Escape')
  await expect(side.getByRole('menu', { name: '推理强度', exact: true })).toHaveCount(0)
  await side.locator('.composer-status .sess-config-trigger').click()
  await expect(side.getByRole('menu', { name: '会话设置', exact: true })).toBeVisible()
  await expect(side.getByRole('menuitemcheckbox')).toHaveCount(1)
  const setting = side.getByRole('menuitemcheckbox')
  const checked = await setting.getAttribute('aria-checked')
  await setting.click()
  await expect(setting).toHaveAttribute('aria-checked', checked === 'true' ? 'false' : 'true')
  await page.keyboard.press('Escape')
  mkdirSync('tmp/composer-layout/e2e', { recursive: true })
  await side.locator('.composer').screenshot({ path: 'tmp/composer-layout/e2e/side-280-config.png', scale: 'css' })
})
