/** Actual Electron + installed Pi child; deterministic localhost replies only. */
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {test,expect,在项目里开会话} from './fixtures.js'
test.use({dawnOptions:{gitInit:true}})
test('live child correction shows accepted then applied at a real tool boundary, and named stop drains pending correction',async({dawn})=>{
 const{page,requests}=dawn,out=resolve('docs/validation/live-parallel-20261105/stage-a');mkdirSync(out,{recursive:true})
 await 在项目里开会话(page)
 const send=async()=>{await page.locator('main.main .composer textarea').fill('派子agent慢慢看');await page.getByRole('button',{name:'发送',exact:true}).click()}
 await send();let chip=page.locator('main.main .chip-group .chip').last();await expect(chip.locator('.chip-activity')).toContainText('sleep 15');await chip.click()
 const pane=page.locator('.subagent-pane');await expect(pane.getByRole('textbox',{name:'实时纠偏',exact:true})).toBeVisible()
 await pane.getByRole('textbox',{name:'实时纠偏',exact:true}).fill('桌面纠偏：请在工具完成后确认收到这句话。');await pane.getByRole('button',{name:'纠偏提交',exact:true}).click()
 await expect(pane.locator('[data-steering-status="accepted"]')).toContainText('已接收，等待进入上下文');await expect(pane.locator('[data-steering-status="applied"]')).toHaveCount(0)
 await page.screenshot({path:join(out,'desktop-accepted.png')})
 await expect(pane.locator('[data-steering-status="applied"]')).toContainText('已进入模型上下文',{timeout:25000});await expect(chip).toHaveAttribute('data-status','ok')
 await page.screenshot({path:join(out,'desktop-applied.png')})
 expect(requests.some(request=>JSON.stringify(request).includes('[subagent-steer:'))).toBe(true)
 await expect(page.locator('main.main').getByRole('button',{name:'停止',exact:true})).toHaveCount(0)
 await send();chip=page.locator('main.main .chip-group .chip').last();await expect(chip.locator('.chip-activity')).toContainText('sleep 15');await chip.click()
 await pane.getByRole('textbox',{name:'实时纠偏',exact:true}).fill('桌面取消：这条纠偏在当前工具完成前停止。');await pane.getByRole('button',{name:'纠偏提交',exact:true}).click()
 await expect(pane.locator('[data-steering-status="accepted"]')).toHaveCount(1)
 await pane.getByRole('button',{name:'中止子任务',exact:true}).click();await expect(pane.locator('[data-steering-status="interrupted"]')).toContainText('已中断，是否生效未确认');await expect(chip).toHaveAttribute('data-status','error');await expect(pane.locator('.subagent-live-control [role="status"]')).toContainText('子任务已结束并排空');await expect(pane.locator('.tool-head').filter({hasText:'sleep 15'})).toContainText('已中断')
 await page.screenshot({path:join(out,'desktop-cancelled.png')})
 writeFileSync(join(out,'desktop-demo.json'),JSON.stringify({actualElectron:true,actualPiChild:true,deterministicLocalhostProvider:true,acceptedDuringTool:true,appliedAfterTool:true,namedStop:true,requestWithSteerMarker:true,requestCount:requests.length},null,2)+'\n')
})
