# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: provider-routing-audit.spec.ts >> selecting DeepSeek overrides old Kimi ordering for new tasks and survives application restart
- Location: e2e/provider-routing-audit.spec.ts:27:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.composer .model-pill')
Expected substring: "deepseek-flash"
Received string:    "Kkimi-mock"
Timeout: 25000ms

Call log:
  - Expect "toContainText" with timeout 25000ms
  - waiting for locator('.composer .model-pill')
    54 × locator resolved to <div class="pill model-pill">…</div>
       - unexpected value "Kkimi-mock"

```

```yaml
- button "当前模型：kimi-mock。点击切换": kimi-mock
```

# Test source

```ts
  1  | import {test,expect,开一段临时会话} from './fixtures.js'
  2  | import type {Page} from '@playwright/test'
  3  | import {mkdirSync,writeFileSync} from 'node:fs'
  4  | import {resolve,join} from 'node:path'
  5  | 
  6  | test.use({dawnOptions:{providersYaml:`agents:
  7  |   kimi-first:
  8  |     kind: native
  9  |     provider: kimi-coding
  10 |     model: kimi-mock
  11 |     capabilities: [chat, exec]
  12 |   deepseek-second:
  13 |     kind: native
  14 |     provider: deepseek
  15 |     model: deepseek-flash
  16 |     capabilities: [chat, exec]
  17 | `}})
  18 | async function send(page:Page,text:string,requests:unknown[]){
  19 |  const before=requests.length
  20 |  const beforeReplies=await page.getByText(/假模型已应答：DAWN 的整条链路是通的。/).count()
  21 |  await page.getByPlaceholder(/输入问题/).fill(text)
  22 |  await page.getByRole('button',{name:'发送',exact:true}).click()
  23 |  await expect.poll(()=>requests.length).toBe(before+1)
  24 |  await expect(page.getByText(/假模型已应答：DAWN 的整条链路是通的。/)).toHaveCount(beforeReplies+1)
  25 |  await expect(page.locator('.composer .model-trigger')).toBeEnabled()
  26 | }
  27 | test('selecting DeepSeek overrides old Kimi ordering for new tasks and survives application restart',async({dawn})=>{
  28 |  let page=dawn.page
  29 |  await 开一段临时会话(page)
  30 |  await expect(page.locator('.composer .model-pill')).toContainText('kimi-mock')
  31 |  await page.locator('.composer .model-pill').getByRole('button').click()
  32 |  await page.getByRole('menuitem',{name:/deepseek-flash/}).click()
  33 |  await expect(page.locator('.composer .model-pill')).toContainText('deepseek-flash')
  34 |  await send(page,'DeepSeek selection before restart',dawn.requests)
  35 |  expect((dawn.requests.at(-1) as any).body?.model).toBe('deepseek-flash')
  36 |  const evidence=resolve('docs/validation/api-routing-audit-20261111');mkdirSync(evidence,{recursive:true})
  37 |  await page.screenshot({path:join(evidence,'deepseek-selected.png')})
  38 |  await page.getByRole('button',{name:'新建任务',exact:true}).click()
  39 |  await expect(page.locator('.agent-pill')).toContainText(/DeepSeek|deepseek/)
  40 |  await send(page,'New task must also use DeepSeek',dawn.requests)
  41 |  await expect(page.locator('.composer .model-pill')).toContainText('deepseek-flash')
  42 |  expect((dawn.requests.at(-1) as any).body?.model).toBe('deepseek-flash')
  43 |  page=await dawn.重开()
  44 |  await page.locator('.session-list .sess-item').filter({hasText:/DeepSeek select/}).locator('.row').first().click()
> 45 |  await expect(page.locator('.composer .model-pill')).toContainText('deepseek-flash')
     |                                                      ^ Error: expect(locator).toContainText(expected) failed
  46 |  await send(page,'After actual restart',dawn.requests)
  47 |  await expect.poll(()=>(dawn.requests.at(-1) as any)?.body?.model).toBe('deepseek-flash')
  48 |  await page.screenshot({path:join(evidence,'deepseek-after-restart.png')})
  49 |  writeFileSync(join(evidence,'http-request-models.json'),JSON.stringify(dawn.requests.map((r:any)=>({url:r.url,model:r.body?.model})),null,2))
  50 | })
  51 | 
```