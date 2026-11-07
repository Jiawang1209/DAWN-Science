/** A bounded, owned descendant cleanup fixture makes the real stopping phase observable. */
import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
const script=`import os, signal, sys, time
from pathlib import Path
os.setsid()
Path('cleanup.pid').write_text(str(os.getpid()))
parent = os.getppid()
def cleanup(sig, frame):
    Path('cleanup-started.txt').write_text(str(time.monotonic()))
    for i in range(12):
        print('controlled fixture cleanup', i, flush=True)
        time.sleep(0.05)
    Path('cleanup-finished.txt').write_text(str(time.monotonic()))
    sys.exit(0)
signal.signal(signal.SIGTERM, cleanup)
print('controlled cleanup fixture ready', flush=True)
while os.getppid() == parent:
    time.sleep(0.01)
os.kill(os.getpid(), signal.SIGTERM)
`
test.use({dawnOptions:{gitInit:true,toolCall:[
 {when:'协作停止界面验收',toolName:'subagent',args:{agent:'cleanup-agent',task:'受控清理子任务'},once:true},
 {duringTask:'受控清理子任务',toolName:'bash',args:{command:'python3 cleanup-fixture.py & wait'},once:true},
]}})
test('shows actual stopping until the bounded descendant finishes, without claiming an artifact lock',async({dawn},testInfo)=>{
 const{page,workspace}=dawn,out=resolve(process.env.DAWN_OUTCOME_EVIDENCE_DIR??testInfo.outputPath('evidence'),'stopping');mkdirSync(out,{recursive:true});mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
 writeFileSync(join(workspace,'cleanup-fixture.py'),script);writeFileSync(join(workspace,'.dawn/agents/cleanup-agent.md'),'---\nname: cleanup-agent\ndescription: bounded owned cleanup fixture\ntools: bash\n---\nRun only the declared fixture command.')
 let pid:number|undefined
 try{
  await 在项目里开会话(page);await 进坞(page,'团队')
  await page.locator('main.main .composer textarea').fill('协作停止界面验收');await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect.poll(()=>existsSync(join(workspace,'cleanup.pid'))).toBe(true);pid=Number(readFileSync(join(workspace,'cleanup.pid'),'utf8'))
  const outcome=page.getByRole('region',{name:'协作成果',exact:true})
  const stopping=outcome.locator('h4').filter({hasText:'正在停止，等待执行排空'}).waitFor({state:'visible'})
  await page.locator('main.main').getByRole('button',{name:'停止',exact:true}).click();await stopping
  await expect(outcome).toHaveAttribute('data-outcome','stopping');await expect(outcome).not.toContainText('持有产物锁')
  const owner=readdirSync(join(workspace,'.dawn/sessions'))[0]!
  const hostOverview=await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as {runs:Array<{phase:string}>},owner)
  expect(hostOverview.runs.some(run=>run.phase==='stopping')).toBe(true)
  writeFileSync(join(out,'actual-stopping.json'),JSON.stringify({actualElectron:true,inference:'localhost-fixture',observedThrough:'host invalidation push; no manual refresh',hostOverview},null,2))
  await page.screenshot({path:join(out,'actual-stopping.png')})
  await expect(outcome).toHaveAttribute('data-outcome','cancelled');await expect(outcome).toContainText('宿主已核验执行排空')
  await expect.poll(()=>{try{process.kill(pid!,0);return false}catch{return true}}).toBe(true)
  await page.screenshot({path:join(out,'actual-cancelled-drained.png')})
  writeFileSync(join(out,'fixture.json'),JSON.stringify({actualElectron:true,inference:'localhost-fixture',controlledDescendantCleanupMs:600,ownedPid:pid,ownedExited:true,cleanupElapsedMs:(Number(readFileSync(join(workspace,'cleanup-finished.txt'),'utf8'))-Number(readFileSync(join(workspace,'cleanup-started.txt'),'utf8')))*1000,script,scientificValidation:false},null,2))
 }finally{
  if(pid){try{const command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});if(command.includes(join(workspace,'cleanup-fixture.py'))||command.includes('python3 cleanup-fixture.py'))process.kill(pid,'SIGKILL')}catch{/* The bounded owned fixture already exited. */}}
 }
})
