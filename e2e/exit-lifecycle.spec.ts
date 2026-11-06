/** Real lifecycle boundaries. Fault injection validates diagnostics, not historical causality. */
import {spawnSync} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话} from './fixtures.js'
import {collectTree} from '../src/runtime/process-tree.js'
const readFacts=(file:string)=>existsSync(file)?readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]
const diagnosticDir=(fallback:string)=>process.env.DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR||fallback
const alive=(pid:number)=>{try{process.kill(pid,0);return true}catch{return false}}
test.describe('root task shutdown',()=>{
 test.use({dawnOptions:{gitInit:true,toolCall:{when:'主任务退出探针',toolName:'bash',args:{command:'sleep 15'},once:true}}})
 for(const reentrant of [false,true])test(`${reentrant?'repeated quit':'single quit'} during a root bash task drains its owned process before restart`,async({dawn},testInfo)=>{
  const{page}=dawn,pid=dawn.app.process().pid!,baseline=new Set(collectTree(pid).pids)
  const evidence=join(resolve(process.env.DAWN_EXIT_DEMO_DIR??'docs/validation/electron-exit-investigation-20261106/demo'),reentrant?'repeated':'single');mkdirSync(evidence,{recursive:true})
  let owned:number[]=[]
  try{
   await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('主任务退出探针：运行慢工具后回报。');await page.getByRole('button',{name:'发送',exact:true}).click()
   await expect(page.locator('.tool[data-tool-name="bash"]')).toHaveAttribute('data-status','running')
   await expect.poll(()=>{
    const candidates=collectTree(pid).pids.filter(id=>!baseline.has(id))
    if(!candidates.length)return 0
    const result=spawnSync('ps',['-p',candidates.join(','),'-o','pid=,comm='],{encoding:'utf8'})
    if(result.error)throw result.error
    const rows=(result.stdout??'').trim().split('\n')
    owned=rows.filter(row=>/\s(?:\S*\/)?sleep$/.test(row.trim())).map(row=>Number(row.trim().split(/\s+/)[0]))
    return owned.length
   }).toBeGreaterThan(0)
   await page.screenshot({path:join(evidence,'root-running.png')})
   if(reentrant)await dawn.app.evaluate(({app})=>{app.once('will-quit',()=>process.nextTick(()=>app.quit()))})
   const restarted=await dawn.重开()
   const facts=readFacts(join(diagnosticDir(testInfo.outputPath('electron-exit')),`app-${pid}.jsonl`))
   writeFileSync(join(evidence,'root-quit-result.json'),JSON.stringify({pid,owned,aliveAfterRestart:owned.filter(alive),events:facts.map(row=>row.event)},null,2)+'\n')
   expect(facts.map(row=>row.event)).toContain('shutdown-async-complete')
   expect(facts.map(row=>row.event)).toContain('shutdown-drained')
   await expect.poll(()=>owned.filter(alive),{timeout:1000}).toEqual([])
   await restarted.getByRole('button',{name:/^主任务退出探针/}).click()
   await expect(restarted.getByRole('button',{name:'停止',exact:true})).toHaveCount(0)
   await restarted.screenshot({path:join(evidence,'root-recovered.png')})
  }finally{
   // A failing regression must not leave its own known sleep process behind.
   const forcedCleanup:number[]=[]
   for(const id of owned)if(alive(id))try{process.kill(id,'SIGKILL');forcedCleanup.push(id)}catch{}
   writeFileSync(join(evidence,'root-cleanup.json'),JSON.stringify({owned,forcedCleanup})+'\n')
  }
 })
})
test('diagnoses a deliberately vetoed quit while the native process is still alive',async({dawn},testInfo)=>{
 const pid=dawn.app.process().pid!,dir=diagnosticDir(testInfo.outputPath('electron-exit')),file=join(dir,`app-${pid}.jsonl`)
 writeFileSync(join(dir,`fault-${pid}.json`),JSON.stringify({kind:'before-quit-veto',releaseMs:6500})+'\n')
 await dawn.app.evaluate(({app})=>{
  app.once('before-quit',event=>event.preventDefault())
  // Deliberate, bounded veto; release through the normal quit path, never a kill.
  setTimeout(()=>app.quit(),6500)
 })
 const restarting=dawn.重开()
 try{
  await expect.poll(()=>readFacts(join(dir,`exit-${pid}.jsonl`)).some(row=>row.event==='still-waiting-5s')).toBe(true)
  expect(alive(pid)).toBe(true)
  const before=readFacts(file).map(row=>row.event)
  expect(before).toContain('before-quit');expect(before).not.toContain('will-quit')
 }finally{await restarting}
 const after=readFacts(file).map(row=>row.event)
 expect(after.filter(event=>event==='before-quit')).toHaveLength(2)
 expect(after).toContain('shutdown-sync-complete');expect(after).toContain('process-exit')
})
