import {it,expect,afterEach} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {SubagentExecutor} from '../../src/subagent/executor.js'
import {跑一轮} from '../../src/team/runner.js'
import {OrchestrationStore} from '../../src/orchestration/store.js'
import {OrchestrationService} from '../../src/orchestration/service.js'
const roots:string[]=[];afterEach(()=>roots.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})))
const definition={name:'worker',description:'worker',systemPrompt:'private prompt',filePath:'/unused',model:'resolved'}
const childOf=()=>({command:process.execPath,args:['-e',`let b='';process.stdin.on('data',d=>{b+=d;let i=b.indexOf('\\n');if(i<0&&!b.endsWith('}'))return;const s=JSON.parse(i>=0?b.slice(0,i):b);b='';for(const sample of [{version:1,availability:'available',source:'sdk-estimate',observedAt:10,provider:s.provider,model:s.model,usedTokens:37},{version:1,availability:'available',source:'sdk-estimate',observedAt:20,provider:s.provider,model:'wrong',usedTokens:999}])process.stdout.write(JSON.stringify({type:'context_observation',sample})+'\\n');process.stdout.write(JSON.stringify({type:'done',ok:true,output:'done'})+'\\n');process.exit(0)})`]})
const setup=()=>{const dir=mkdtempSync(join(tmpdir(),'dawn-p14-d1-process-'));roots.push(dir);const store=new OrchestrationStore(dir,'owner'),service=new OrchestrationService(store);return{dir,store,service}}
it('ordinary executor binds final definition model at actual spawn without steering or settings',async()=>{
 const {dir,store,service}=setup();const executor=new SubagentExecutor({childOf,context:{provider:'p',model:'parent',cwd:dir,agentDirOf:i=>join(dir,String(i))},orchestration:{service,addressOf:i=>['call',String(i)]}})
 const result=await executor.run({mode:'single',agent:'worker',task:'task'},[definition]);expect(result.results[0]?.ok).toBe(true)
 expect(store.list()[0]?.contextObservation).toMatchObject({ownerSessionId:'owner',epoch:1,sample:{model:'resolved',usedTokens:37}});expect(store.budget().knownTokens).toBe(0);expect(store.list()[0]?.settings).toBeUndefined();await service.close()
})
it('team runner captures its own actual execution scope and resolved member model',async()=>{
 const {dir,store,service}=setup(),child=store.register('team',['t','worker','1'],'worker')
 const work=()=>跑一轮({definition,memberName:'worker',teamId:'t',prompt:'task',systemPrompt:'secret',sessionDir:dir,resume:false,agentDir:dir,provider:'member-p',model:'member-m'},{childOf,context:{provider:'parent-p',model:'parent-m',cwd:dir},onCall:async()=>''})
 await service.run(child.id,async()=>work());expect(store.get(child.id)?.contextObservation).toMatchObject({ownerSessionId:'owner',epoch:1,sample:{provider:'member-p',model:'member-m',usedTokens:37}});await service.close()
})
