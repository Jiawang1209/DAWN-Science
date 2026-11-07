/** Built Electron + real Pi child; inference only is the shared localhost fixture. */
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,toolCallHook} from './fixtures.js'
const task='提交反馈子任务：读取 in.csv 后正式提交审阅'
const value={summary:'已读取合成数据',blockers:[],deliverables:[],execution:{state:'not_run',note:'只读'},verification:{state:'reviewed',note:'实际读取',toolCallIds:['forged-id']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv']}}
test.use({dawnOptions:{reply:'提交反馈夹具已完成。',toolCall:[
 {when:'提交反馈主任务',toolName:'start_subagent',args:{agent:'feedback-reviewer',task,contract:{submission:'tool',resultType:'review',inputs:['in.csv'],requireReview:true}}},
 {duringTask:task,toolName:'read',args:{path:'in.csv'}},
 {duringTask:task,toolName:'submit_task_result',args:value},
 {duringTask:task,toolName:'submit_task_result',args:value,evidenceReferences:{verification:'read'}},
]}})
test('declarative task matching accepts Pi text-array prompts across result turns',()=>{
 for(const content of [task,[{type:'text',text:task}]]){
  const hook=toolCallHook({duringTask:task,toolName:'read',args:{path:'in.csv'}})!
  expect(hook({messages:[{role:'user',content},{role:'assistant',content:'working'},{role:'tool',content:'prior result',tool_call_id:'prior'}]})).toEqual({toolName:'read',args:{path:'in.csv'}})
 }
})
test('fixture evidence references reject missing, forged and ambiguous labels',()=>{
 const spec={toolName:'submit_task_result',args:value,evidenceReferences:{verification:'read'}} as const
 const tool=(id:string,labelId=id)=>({role:'tool',tool_call_id:id,content:`[task_tool_evidence] ${JSON.stringify({toolCallId:labelId,name:'read',status:'done',truncatedFields:[]})}`})
 expect(()=>toolCallHook(spec)!({messages:[]})).toThrow('exactly one')
 expect(()=>toolCallHook(spec)!({messages:[tool('actual','forged')]})).toThrow('exactly one')
 expect(()=>toolCallHook(spec)!({messages:[tool('r1'),tool('r2')]})).toThrow('found 2')
 expect(toolCallHook(spec)!({messages:[tool('actual')]} )!.args.verification).toMatchObject({toolCallIds:['actual']})
})
test('a real child corrects an invalid evidence reference using the host-visible label',async({dawn})=>{
 const {page,workspace,dir,requests}=dawn
 mkdirSync(join(workspace,'.dawn','agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n')
 writeFileSync(join(workspace,'.dawn','agents','feedback-reviewer.md'),'---\nname: feedback-reviewer\ndescription: 审阅指定文件\ntools: read\n---\n按冻结契约审阅并正式提交。\n')
 await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('提交反馈主任务');await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect(page.locator('.chip-group .chip').first()).toHaveAttribute('data-status','ok',{timeout:45000})
 await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0,{timeout:45000})
 const states=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!e.isSymbolicLink()&&!['electron-user-data','.git'].includes(e.name)?states(join(p,e.name)):e.name==='state.json'&&p.endsWith('orchestration')?[join(p,e.name)]:[])
 const state=states(dir).map(p=>JSON.parse(readFileSync(p,'utf8'))).find(s=>s.messages?.some((m:{outcome?:{receipt?:unknown}})=>m.outcome?.receipt))
 const outcome=state.messages.find((m:{outcome?:{receipt?:unknown}})=>m.outcome?.receipt).outcome
 expect(outcome).toMatchObject({receipt:{state:'accepted',result:{verification:{state:'reviewed'}}},observation:{submissionAttempts:2,invalidSubmissions:1}})
 const messages=requests.flatMap((request:any)=>request.body?.messages??[]),toolResults=messages.filter((m:any)=>m.role==='tool'&&typeof m.content==='string')
 const feedback=toolResults.flatMap((m:any)=>{try{const value=JSON.parse(m.content);return value.recorded===false&&value.evidenceCatalog?[value]:[]}catch{return[]}}).find((f:any)=>f.evidenceCatalog.entries.some((e:any)=>e.name==='read'))
 expect(feedback).toBeDefined();expect(feedback.contract).toMatchObject({inputs:['in.csv'],outputs:[],requireReview:true,readRequirements:['in.csv']})
 const label=toolResults.flatMap((m:any)=>m.content.split('\n').filter((line:string)=>line.startsWith('[task_tool_evidence] ')).map((line:string)=>JSON.parse(line.slice('[task_tool_evidence] '.length)))).find((e:any)=>e.name==='read')
 expect(label).toMatchObject({name:'read',status:'done',execution:'not_observed',path:'in.csv'})
 expect(outcome.receipt.result.verification.toolCallIds).toEqual([label.toolCallId]);expect(label.toolCallId).not.toBe('forged-id')
 expect(feedback.evidenceCatalog.entries).toContainEqual(label)
 expect(readFileSync(join(workspace,'in.csv'),'utf8')).toBe('x\n1\n2\n')
 const output=resolve(process.env.DAWN_SUBMISSION_EVIDENCE_DIR??'docs/validation/submission-evidence-20261107');mkdirSync(output,{recursive:true})
 writeFileSync(join(output,'phase-a-model-visible-example.json'),JSON.stringify({inference:'shared localhost fixture; real Pi child',label,invalidFeedback:feedback,recorded:outcome.receipt.result,observation:outcome.observation},null,2)+'\n')
})
