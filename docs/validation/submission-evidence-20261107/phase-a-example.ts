/** Offline real file-tool example. No model request or persistent app data. */
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createTaskTools,resolveTaskSettings} from '../../../src/subagent/task-tools.js'
import {TaskContractSchema} from '../../../src/orchestration/task-contract.js'
const cwd=mkdtempSync(join(tmpdir(),'dawn-feedback-example-'))
try{
 writeFileSync(join(cwd,'in.csv'),'x\n1\n2\n')
 const contract=TaskContractSchema.parse({submission:'tool',resultType:'review',requireReview:true,inputs:['in.csv']})
 const task=createTaskTools(cwd,resolveTaskSettings(contract,'allow-all',['read']))
 const read=await task.tools.find(t=>t.name==='read')!.execute('example-host-read',{path:'in.csv',toolCallId:'model-forged'})
 const value={summary:'合成文件已读取',blockers:[],deliverables:[],execution:{state:'not_run',note:'只读'},verification:{state:'reviewed',note:'实际 read',toolCallIds:['model-forged']},data:{kind:'review',verdict:'pass',findings:[],reviewedPaths:['in.csv']}}
 const rejected=await task.submission!.submit(value)
 const schemaError=await task.submission!.submit({...value,execution:{state:'invented',note:'invalid state'}})
 const corrected=await task.submission!.submit({...value,verification:{...value.verification,toolCallIds:['example-host-read']}})
 writeFileSync(new URL('./phase-a-tool-feedback-example.json',import.meta.url),JSON.stringify({inference:'none; real Pi file tool invoked directly',modelVisibleRead:read.content,semanticFeedback:JSON.parse(rejected.content[0]!.text),schemaFeedback:JSON.parse(schemaError.content[0]!.text),corrected:JSON.parse(corrected.content[0]!.text),authoritativeEvidence:task.evidence(),observation:task.submission!.observation()},null,2)+'\n')
}finally{rmSync(cwd,{recursive:true,force:true})}
