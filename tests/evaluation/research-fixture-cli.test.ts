import {expect,it} from 'vitest'
import {execFile,spawn,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {promisify} from 'node:util'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,dirname,basename} from 'node:path'
import {collectTree,killOwnedProcessTree} from '../../src/runtime/process-tree.js'
const run=promisify(execFile),entry=resolve('scripts/evaluate-research-fixture.ts')
it('the legacy direct fixture CLI rejects a missing destination instead of silently succeeding',async()=>{
 await expect(run(process.execPath,['--import','tsx',entry])).rejects.toMatchObject({code:1,stderr:expect.stringContaining('需要显式指定评测输出目录')})
})
it('the legacy direct fixture CLI runs the real offline batch and prints a retained report path',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-fixture-cli-'))
 try{
  const{stdout}=await run(process.execPath,['--import','tsx',entry,root],{timeout:60000})
  const reportPath=stdout.trim().split('\n').at(-1)!
  expect(basename(dirname(reportPath))).toMatch(/^research-fixture-/)
  expect(basename(reportPath)).toBe('research.md')
  expect(readFileSync(reportPath,'utf8')).toContain('分阶段用量')
  const report=JSON.parse(readFileSync(join(dirname(reportPath),'research.json'),'utf8'))
  expect(report).toMatchObject({inference:'fixture',completePairs:6,qualifiedPairs:6})
 }finally{rmSync(root,{recursive:true,force:true})}
},60000)
it.skipIf(process.platform==='win32')('SIGINT drains the actual detached executor and retains the cancelled batch',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dawn-fixture-cancel-'))
 const child=spawn(process.execPath,['--import','tsx',entry,root],{detached:true,stdio:'ignore'})
 const closed=once(child,'close'),agents:number[]=[]
 const stillAgent=(pid:number)=>{try{return execFileSync('ps',['-p',String(pid),'-o','args='],{encoding:'utf8'}).includes('/dist/electron/subagent-child.js')}catch{return false}}
 try{
  await expect.poll(()=>{
   const found=collectTree(child.pid!).pids.filter(pid=>pid!==child.pid&&stillAgent(pid))
   for(const pid of found)if(!agents.includes(pid))agents.push(pid)
   return agents.length
  },{timeout:15000,interval:50}).toBeGreaterThan(0)
  child.kill('SIGINT')
  expect(await closed).toEqual([1,null])
  await expect.poll(()=>agents.filter(stillAgent),{timeout:5000}).toEqual([])
  const reports=(await import('node:fs')).readdirSync(root).filter(n=>n.startsWith('research-fixture-'))
  expect(reports).toHaveLength(1)
  const batch=join(root,reports[0]!),report=JSON.parse(readFileSync(join(batch,'research.json'),'utf8'))
  expect(report.rows.some((r:{terminal:string})=>r.terminal==='cancelled')).toBe(true)
  expect(JSON.parse(readFileSync(join(batch,'request-gate.json'),'utf8')).inFlight).toBe(0)
 }finally{
  if(child.exitCode===null&&child.signalCode===null)killOwnedProcessTree(child)
  for(const pid of agents)if(stillAgent(pid)){try{process.kill(-pid,'SIGKILL')}catch{};try{process.kill(pid,'SIGKILL')}catch{}}
  rmSync(root,{recursive:true,force:true})
 }
},30000)
