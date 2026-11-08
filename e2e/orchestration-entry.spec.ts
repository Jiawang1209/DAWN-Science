import {mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'

const out=resolve(process.env.DAWN_ORCHESTRATION_ENTRY_EVIDENCE_DIR??'docs/validation/orchestration-entry-20261109/desktop')
test.use({dawnOptions:{gitInit:true}})
test('workflow entry stays visible above clarification and returns to the same conversation',async({dawn})=>{
 const{page,workspace}=dawn;mkdirSync(out,{recursive:true})
 writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
 await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
 await 在项目里开会话(page);await 进坞(page,'团队')
 const auto=page.getByRole('region',{name:'自动安排',exact:true})
 await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('计算 input.csv 均值，单位未提供')
 await auto.getByRole('button',{name:'生成安排',exact:true}).click()
 const answer=page.getByRole('textbox',{name:'问题 1 的回答',exact:true})
 await expect(answer).toBeVisible();await answer.fill('mg/g')
 const entry=page.getByRole('button',{name:'打开编排视图',exact:true})
 await expect(entry).toBeInViewport()
 await answer.scrollIntoViewIfNeeded();await expect(entry).toBeInViewport()
 const before=dawn.requests.length
 await entry.click()
 const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
 await expect(dialog).toBeVisible()
 await expect(dialog.getByRole('heading',{name:'Agent 网络',exact:true})).toBeInViewport()
 await expect(dialog.getByRole('button',{name:'返回 DAWN 对话',exact:true})).toBeInViewport()
 await page.screenshot({path:join(out,'expanded.png')})
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0)
 await expect(entry).toBeFocused();await expect(answer).toHaveValue('mg/g')
 await entry.click();await page.getByRole('button',{name:'返回 DAWN 对话',exact:true}).click()
 await expect(dialog).toHaveCount(0);await expect(entry).toBeFocused()
 await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toHaveCount(1)
 expect(dawn.requests.length).toBe(before);expect(existsSync(join(workspace,'mean.csv'))).toBe(false)
 await page.screenshot({path:join(out,'back-to-chat.png')})
})
