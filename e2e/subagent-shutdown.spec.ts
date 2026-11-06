/** Quit a real running child, then prove state and process drain before reopening. */
import {mkdirSync,writeFileSync,readdirSync,readFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话} from './fixtures.js'
import {collectTree} from '../src/runtime/process-tree.js'
test.use({dawnOptions:{gitInit:true,toolCall:{toolName:'subagent',args:{agent:'scout',task:'子任务慢：运行慢工具后回报。',handoff:{recentMessages:1}},once:true}}})
test('app quit drains an active delegated process before restart and retains the frozen context',async({dawn})=>{
 const {page,workspace}=dawn
 mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
 writeFileSync(join(workspace,'.dawn/agents/scout.md'),'---\nname: scout\ndescription: shutdown fixture\ntools: read,bash\n---\n按任务运行。')
 await 在项目里开会话(page)
 await page.getByPlaceholder(/输入问题/).fill('保留原数据；启动一个慢子任务，随后关闭应用。')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect(page.locator('.chip-group .chip').first()).toHaveAttribute('data-status','running')
 await page.locator('.chip-group .chip').first().click()
 await expect(page.locator('.subagent-pane .tool[data-tool-name="bash"]')).toHaveAttribute('data-status','running')
 const sid=readdirSync(join(workspace,'.dawn/sessions'))[0]!,root=join(workspace,'.dawn/sessions',sid),call=readdirSync(join(root,'subagents'))[0]!,dir=join(root,'subagents',call,'0')
 const handoff=readFileSync(join(dir,'handoff.json'),'utf8')
 const owned=collectTree(dawn.app.process().pid!).pids
 const restarted=await dawn.重开()
 const meta=JSON.parse(readFileSync(join(dir,'meta.json'),'utf8'))
 expect(meta.status).toBe('error');expect(meta.endedAt).toBeGreaterThan(meta.startedAt)
 const states=JSON.parse(readFileSync(join(root,'orchestration/state.json'),'utf8'))
 expect(states.children[0].state).toBe('cancelled')
 expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(handoff)
 await expect.poll(()=>owned.filter(pid=>{try{process.kill(pid,0);return true}catch{return false}})).toEqual([])
 const evidence=resolve(process.env.DAWN_HANDOFF_EVIDENCE_DIR??'docs/validation/observable-handoff-review-20261106')
 mkdirSync(evidence,{recursive:true});writeFileSync(join(evidence,'active-child-shutdown.json'),JSON.stringify({owned,allExited:true,meta,children:states.children},null,2))
 await restarted.getByRole('button',{name:/^保留原数据；启动一个慢子任务/}).click()
 await expect(restarted.locator('.chip-group .chip').first()).toHaveAttribute('data-status','error')
 await restarted.screenshot({path:join(evidence,'active-child-recovered.png')})
})
