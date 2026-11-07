/** Actual CLI cancellation proof. Its SIGKILL process-tree path has no durable stopping frame. */
import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {join,resolve} from 'node:path'
import {collectTree} from '../src/runtime/process-tree.js'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
const script="import os, time\nfrom pathlib import Path\nPath('owned-worker.pid').write_text(str(os.getpid()))\nprint('owned CLI worker ready', flush=True)\ntime.sleep(30)\n"
test.use({dawnOptions:{gitInit:true,toolCall:[
 {when:'协作停止界面验收',toolName:'subagent',args:{agent:'cleanup-agent',task:'受控清理子任务'},once:true},
 {duringTask:'受控清理子任务',toolName:'bash',args:{command:'python3 "$PWD/owned-worker.py"'},once:true},
]}})
test('shows host-verified cancellation after actual owned CLI termination; transient stopping is not a screenshot claim',async({dawn},testInfo)=>{
 const{page,workspace}=dawn,out=resolve(process.env.DAWN_OUTCOME_EVIDENCE_DIR??testInfo.outputPath('evidence'),'cancellation');mkdirSync(out,{recursive:true});mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
 writeFileSync(join(workspace,'owned-worker.py'),script);writeFileSync(join(workspace,'.dawn/agents/cleanup-agent.md'),'---\nname: cleanup-agent\ndescription: owned CLI cancellation fixture\ntools: bash\n---\nRun only the declared fixture command.')
 let pid:number|undefined
 try{
  await 在项目里开会话(page);await 进坞(page,'团队')
  const baseline=new Set(collectTree(dawn.app.process().pid!).pids)
  await page.locator('main.main .composer textarea').fill('协作停止界面验收');await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect.poll(()=>existsSync(join(workspace,'owned-worker.pid'))).toBe(true);pid=Number(readFileSync(join(workspace,'owned-worker.pid'),'utf8'))
  const owned=collectTree(dawn.app.process().pid!).pids.filter(id=>!baseline.has(id));expect(owned).toContain(pid)
  const outcome=page.getByRole('region',{name:'协作成果',exact:true});await expect(outcome).toHaveAttribute('data-outcome','active')
  await page.locator('main.main').getByRole('button',{name:'停止',exact:true}).click()
  await expect(outcome).toHaveAttribute('data-outcome','cancelled');await expect(outcome).toContainText('宿主已核验执行排空');await expect(outcome).not.toContainText('持有产物锁');await expect(page.getByRole('region',{name:'运行总览',exact:true}).locator('.agent-observation[data-context-current="true"]')).toHaveCount(0)
  const owner=readdirSync(join(workspace,'.dawn/sessions'))[0]!
  const hostOverview=await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as {source:string;runs:Array<{phase:string;state:string;epoch:number;resultEpoch?:number}>},owner)
  expect(hostOverview.source).toBe('live');expect(hostOverview.runs).toHaveLength(1)
  expect(hostOverview.runs[0]).toMatchObject({phase:'drained',state:'cancelled'});expect(hostOverview.runs[0]!.epoch).toBeGreaterThan(0);expect(hostOverview.runs[0]!.resultEpoch).toBe(hostOverview.runs[0]!.epoch)
  await expect.poll(()=>owned.filter(id=>{try{process.kill(id,0);return true}catch{return false}})).toEqual([])
  await page.screenshot({path:join(out,'actual-cancelled-drained.png')});await outcome.screenshot({path:join(out,'actual-cancelled-drained-panel.png')})
  writeFileSync(join(out,'fixture.json'),JSON.stringify({actualElectron:true,inference:'localhost-fixture',ownedPid:pid,ownedProcessTree:owned,allOwnedExited:true,hostOverview,script,scientificValidation:false,stoppingScreenshotCaptured:false,limitation:'CLI cancellation SIGKILLs the owned child process tree; stopping is transient. Gated host and UI tests cover the stopping state; longer-lived actual Bot/MCP drain is not exercised.'},null,2))
 }finally{
  if(pid){try{const command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});if(command.includes(join(workspace,'owned-worker.py')))process.kill(pid,'SIGKILL')}catch{/* The owned fixture already exited. */}}
 }
})
