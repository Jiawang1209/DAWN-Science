import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {acceptTaskResult} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/task-contract.ts';
import {SubagentExecutor} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/subagent/executor.ts';
import {OrchestrationStore} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/store.ts';
import {OrchestrationService} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/orchestration/service.ts';
async function main(){
const dir=mkdtempSync(join(tmpdir(),'dawn-usage-review-cancel-')), store=new OrchestrationStore(dir,'owner'),service=new OrchestrationService(store),abort=new AbortController();
const observed={elapsedMs:5,submissionAttempts:0,invalidSubmissions:0,usage:{input:10,output:2,cacheRead:1}};
const output=JSON.stringify({summary:'completed',blockers:[],deliverables:[],execution:{state:'not_run',note:'read-only task'},verification:{state:'unreviewed',note:'no review required'}});
console.log('preCancelReceipt',acceptTaskResult({version:1,inputs:[],outputs:[],access:'read-only',requireExecution:false,requireReview:false},output,[],dir).state);
const actual=store.observeStage.bind(store);let acceptance=false;
store.observeStage=(...args)=>{const result=actual(...args);if(args[2]==='acceptance'){acceptance=true}return result};
const executor=new SubagentExecutor({
 childOf:()=>({command:process.execPath,args:['-e',`process.stdin.once('data',()=>{console.log(JSON.stringify(${JSON.stringify({type:'done',ok:true,output,observation:observed})}));process.exit(0)})`]}),
 context:{provider:'p',model:'m',cwd:dir,agentDirOf:i=>join(dir,String(i)),recordReceipt:()=>{throw new Error('receipt persistence unavailable')}},
 orchestration:{service,addressOf:i=>['call',String(i)]},
 prepareTask:()=>({contract:{version:1,inputs:[],outputs:[],access:'read-only',requireExecution:false,requireReview:false},scope:{version:1,tier:'allow-all',access:'read-only',tools:['read'],inputs:[],outputs:[]},versions:{version:1,inputs:[]}})
});
try{const result=await executor.run({mode:'single',agent:'worker',task:'task'},[{name:'worker',description:'worker',systemPrompt:'worker',filePath:'/unused'}],abort.signal);console.log(JSON.stringify({acceptance,emittedUsage:observed.usage,result,usageTotals:store.list()[0]?.usageTotals,budget:service.budgetSnapshot()},null,2))}finally{await service.close();rmSync(dir,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
