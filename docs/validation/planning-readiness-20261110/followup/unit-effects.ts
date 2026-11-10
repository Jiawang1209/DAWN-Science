/** Real host preflight over a disposable synthetic workspace; no model or child process. */
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {strict as assert} from 'node:assert'
import {scienceTemplate,ScienceTemplateSchema} from '../../../../src/team/science-templates.js'
import {stageContract} from '../../../../src/protocol/science-pipeline.js'
import {resolveTaskSettings} from '../../../../src/subagent/task-tools.js'
import {SubagentExecutor} from '../../../../src/subagent/executor.js'
import {taskOutputReservation} from '../../../../src/bot/output-locks.js'
const cwd=mkdtempSync(join(tmpdir(),'dawn-readiness-effect-')),controller=new AbortController()
const timer=setTimeout(()=>controller.abort(),2000)
let release:(()=>void)|undefined,childSpawns=0
try{
 const input='x\n1\n2\n3\n';writeFileSync(join(cwd,'input.csv'),input)
 const template=ScienceTemplateSchema.parse({id:'tabular-ecology',version:1,language:'python',method:'arithmetic mean',units:'',unitStatus:'missing',missingValues:'block'})
 const recipe=scienceTemplate(template,'results',['input.csv'])
 const contract=stageContract({inputs:['input.csv'],outputs:recipe.outputs,acceptance:recipe.acceptance,requireExecution:true},'analyze')
 const settings=resolveTaskSettings(contract,'allow-all')
 release=await taskOutputReservation(cwd,settings,controller.signal)
 const executor=new SubagentExecutor({context:{cwd,provider:'fixture',model:'local',agentDirOf:()=>join(cwd,'agent')},prepareTask:()=>settings,childOf:()=>{childSpawns++;throw Error('must not spawn')}})
 const result=(await executor.run({mode:'single',agent:'a',task:'calculate mean'},[{name:'a',description:'a',systemPrompt:'a',filePath:'/a'}],controller.signal)).results[0]!
 const proof={inference:'none',realModelRequests:0,receipt:result.receipt,childSpawns,otherWriterLockStillHeld:true,lockWaitAborted:controller.signal.aborted,newScientificFiles:recipe.outputs.filter(p=>existsSync(join(cwd,p))),inputUnchanged:readFileSync(join(cwd,'input.csv'),'utf8')===input}
 assert.equal(proof.receipt?.state,'blocked');assert.equal(childSpawns,0);assert.equal(proof.lockWaitAborted,false);assert.deepEqual(proof.newScientificFiles,[]);assert.equal(proof.inputUnchanged,true)
 writeFileSync(new URL('./unit-effects.json',import.meta.url),JSON.stringify(proof,null,2)+'\n')
 console.log(JSON.stringify(proof))
}finally{clearTimeout(timer);controller.abort();release?.();rmSync(cwd,{recursive:true,force:true})}
