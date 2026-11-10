import {test,expect,开一段临时会话} from './fixtures.js'
import type {Page} from '@playwright/test'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'

test.use({dawnOptions:{providersYaml:`agents:
  kimi-first:
    kind: native
    provider: kimi-coding
    model: kimi-mock
    capabilities: [chat, exec]
  deepseek-second:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat, exec]
`}})
async function send(page:Page,text:string,requests:unknown[]){
 const before=requests.length
 const beforeReplies=await page.getByText(/假模型已应答：DAWN 的整条链路是通的。/).count()
 await page.getByPlaceholder(/输入问题/).fill(text)
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect.poll(()=>requests.length).toBe(before+1)
 await expect(page.getByText(/假模型已应答：DAWN 的整条链路是通的。/)).toHaveCount(beforeReplies+1)
 await expect(page.locator('.composer .model-trigger')).toBeEnabled()
}
test('selecting DeepSeek overrides old Kimi ordering for new tasks and survives application restart',async({dawn})=>{
 let page=dawn.page
 await 开一段临时会话(page)
 await expect(page.locator('.composer .model-pill')).toContainText('kimi-mock')
 await page.locator('.composer .model-pill').getByRole('button').click()
 await page.getByRole('menuitem',{name:/deepseek-flash/}).click()
 await expect(page.locator('.composer .model-pill')).toContainText('deepseek-flash')
 await send(page,'DeepSeek selection before restart',dawn.requests)
 expect((dawn.requests.at(-1) as any).body?.model).toBe('deepseek-flash')
 const evidence=resolve('docs/validation/api-routing-audit-20261111');mkdirSync(evidence,{recursive:true})
 await page.screenshot({path:join(evidence,'deepseek-selected.png')})
 await page.getByRole('button',{name:'新建任务',exact:true}).click()
 await expect(page.locator('.agent-pill')).toContainText(/DeepSeek|deepseek/)
 await send(page,'New task must also use DeepSeek',dawn.requests)
 await expect(page.locator('.composer .model-pill')).toContainText('deepseek-flash')
 expect((dawn.requests.at(-1) as any).body?.model).toBe('deepseek-flash')
 page=await dawn.重开()
 await page.locator('.session-list .sess-item').filter({hasText:/DeepSeek select/}).locator('.row').first().click()
 await expect(page.locator('.composer .model-pill')).toContainText('deepseek-flash')
 await send(page,'After actual restart',dawn.requests)
 await expect.poll(()=>(dawn.requests.at(-1) as any)?.body?.model).toBe('deepseek-flash')
 await page.screenshot({path:join(evidence,'deepseek-after-restart.png')})
 await page.locator('.composer-card').screenshot({path:join(evidence,'deepseek-composer-after-restart.png')})
 writeFileSync(join(evidence,'http-request-models.json'),JSON.stringify(dawn.requests.map((r:any)=>({url:r.url,model:r.body?.model})),null,2))
})
