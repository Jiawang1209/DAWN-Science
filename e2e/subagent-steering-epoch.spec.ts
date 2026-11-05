/** Real same-child follow-up crosses epochs; an old draft requires an explicit reset. */
import {mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {test,expect,在项目里开会话} from './fixtures.js'
test.use({dawnOptions:{gitInit:true}})
test('expired correction draft cannot cross a real child epoch and can be explicitly rewritten',async({dawn})=>{
 const {page,requests,workspace}=dawn,out=resolve(process.env.DAWN_SCIENCE_DEMO_DIR??'docs/validation/live-parallel-rereview-20261105/desktop')
 mkdirSync(out,{recursive:true});await 在项目里开会话(page)
 await page.locator('main.main .composer textarea').fill('派子agent慢慢看');await page.getByRole('button',{name:'发送',exact:true}).click()
 const chip=page.locator('main.main .chip-group .chip').last();await expect(chip.locator('.chip-activity')).toContainText('sleep 15');await chip.click()
 const pane=page.locator('.subagent-pane'),oldDraft='旧轮次草稿：不应送入下一轮',newDraft='新轮次纠偏：请确认收到本轮指令'
 await pane.getByRole('textbox',{name:'实时纠偏',exact:true}).fill(oldDraft)
 await pane.getByRole('button',{name:'中止子任务',exact:true}).click()
 await expect(pane.locator('.subagent-live-control [role="status"]')).toContainText('子任务已结束并排空')
 const followUp=pane.getByRole('textbox',{name:'接着问它',exact:true});await expect(followUp).toBeEnabled();await followUp.fill('子任务慢：同一子任务的第二轮，请等待工具完成。')
 await pane.getByRole('button',{name:'接着问',exact:true}).click()
 await expect(pane.getByText('纠偏草稿属于上一轮，请重新撰写当前轮次的指令')).toBeVisible()
 await expect(pane.getByRole('button',{name:'纠偏提交',exact:true})).toBeDisabled()
 await expect(pane.getByRole('textbox',{name:'实时纠偏',exact:true})).toHaveValue(oldDraft)
 await page.screenshot({path:join(out,'epoch-expired.png')})
 await pane.getByRole('button',{name:'重写本轮纠偏',exact:true}).click()
 await expect(pane.getByRole('textbox',{name:'实时纠偏',exact:true})).toHaveValue('')
 await pane.getByRole('textbox',{name:'实时纠偏',exact:true}).fill(newDraft);await pane.getByRole('button',{name:'纠偏提交',exact:true}).click()
 await expect(pane.locator('[data-steering-status="accepted"]')).toContainText(newDraft)
 await expect(pane.locator('[data-steering-status="applied"]')).toContainText(newDraft,{timeout:25000})
 await expect(pane.locator('.subagent-live-control [role="status"]')).toContainText('子任务已结束并排空')
 expect(requests.some(request=>JSON.stringify(request).includes(oldDraft))).toBe(false)
 expect(requests.some(request=>JSON.stringify(request).includes(':2]')&&JSON.stringify(request).includes(newDraft))).toBe(true)
 const states=readdirSync(join(workspace,'.dawn/sessions')).map(id=>join(workspace,'.dawn/sessions',id,'orchestration/state.json')).filter(existsSync).map(path=>JSON.parse(readFileSync(path,'utf8')))
 expect(states.flatMap(state=>state.children).some(child=>child.epoch===2)).toBe(true)
 const receipts=states.flatMap(state=>state.steering);expect(receipts).toHaveLength(1);expect(receipts[0]).toMatchObject({epoch:2,text:newDraft,status:'applied'})
 writeFileSync(join(out,'epoch-demo.json'),JSON.stringify({actualElectron:true,sameChildEpoch:2,oldDraftNotDelivered:true,explicitReset:true,receipts},null,2)+'\n')
 await page.screenshot({path:join(out,'epoch-applied.png')})
})
