import {afterEach,expect,it} from 'vitest'
import {mkdirSync,mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createSubagentTool,createSubagentFollowUp} from '../../src/subagent/tool.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
const roots:string[]=[];afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
async function until(test:()=>boolean){const end=Date.now()+5000;while(!test()){if(Date.now()>end)throw Error('child readiness timeout');await new Promise<void>(r=>setTimeout(r,5))}}
it.each([false,true])('remote=%s preserves ordinary execution and follow-up while reporting only supported realtime control',async remote=>{
 const root=mkdtempSync(join(tmpdir(),'steer-policy-'));roots.push(root);mkdirSync(join(root,'.dawn/agents'),{recursive:true});writeFileSync(join(root,'.dawn/agents/reader.md'),'---\nname: reader\ndescription: reader\n---\nRead only.')
 const service=new OrchestrationService(new OrchestrationStore(root,'p')),release=join(root,'release');let ready=0
 const script=`require('readline').createInterface({input:process.stdin}).once('line',line=>{const spec=JSON.parse(line);if(spec.steering)console.log(JSON.stringify({type:'steer_ready',...spec.steering}));console.log(JSON.stringify({type:'event',event:{kind:'output',data:'backend-ready'}}));const timer=setInterval(()=>{if(require('fs').existsSync(${JSON.stringify(release)})){clearInterval(timer);console.log(JSON.stringify({type:'done',ok:true,output:'ordinary result'}));process.exit(0)}},5)})`
 const options={sessionId:'p',projectRoot:root,remote,orchestration:service,childOf:()=>({command:process.execPath,args:['-e',script],supportsSteering:true as const}),context:{cwd:root,provider:'offline',model:'offline',agentDirOf:()=>join(root,'run')},emit:(event:any)=>{if(event.kind==='subagent_event'&&event.event.kind==='output'&&event.event.data==='backend-ready')ready++}}
 try{
  for(const phase of ['foreground','followup'] as const){
   if(existsSync(release))rmSync(release)
   const run=phase==='foreground'?createSubagentTool(options).execute('call',{agent:'reader',task:'ordinary task'} as never):createSubagentFollowUp(options)('call',0,'reader','ordinary follow-up')
   try{await until(()=>ready===(phase==='foreground'?1:2));const child=service.store.list()[0]!;expect(service.canSteer(child.id)).toBe(!remote);expect(child.epoch).toBe(phase==='foreground'?1:2)}finally{writeFileSync(release,'drain');await run}
  }
  expect(service.store.list()[0]?.state).toBe('completed')
 }finally{writeFileSync(release,'drain');await service.close()}
})
