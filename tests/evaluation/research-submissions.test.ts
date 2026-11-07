import {expect,it} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {researchSubmissionDiagnostics} from '../../src/evaluation/research-submissions.js'

// Sanitized Pi message shapes and exact SDK messages from the saved review trial.
const outputLimit='Tool call "submit_task_result" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.'
const sdkValidationLines='Validation failed for tool "submit_task_result":\n  - data.reviewedPaths: must have required properties reviewedPaths'
const sdkRejected=sdkValidationLines+'\n\nReceived arguments:\n'+JSON.stringify({data:{kind:'review',verdict:'pass',findings:[]}},null,2)
const host={hostAttempts:0,hostRejected:0}
const message=(value:Record<string,unknown>)=>({type:'message',message:value})
const call=(id:unknown,name='submit_task_result')=>message({role:'assistant',content:[{type:'toolCall',id,name,arguments:{}}]})
const result=(id:unknown,text:string,isError=true,toolName='submit_task_result')=>message({role:'toolResult',toolCallId:id,toolName,content:[{type:'text',text}],isError})
const scope=(entries:unknown[],complete=true,scopeId='review')=>({scopeId,entries,complete})
const unknown=(entries:unknown[],complete=true)=>{
 const observed=researchSubmissionDiagnostics(host,[scope(entries,complete)])
 expect(observed).toEqual({...host,source:'host-and-transcript',complete:false})
}

it('separates output-limit nonexecution, SDK rejection and host rejection from the saved review sequence',()=>{
 const observed=researchSubmissionDiagnostics({hostAttempts:1,hostRejected:1},[scope([
  call('limit'),result('limit',outputLimit),call('sdk'),result('sdk',sdkRejected),
  call('host'),result('host',JSON.stringify({recorded:false,error:'审阅文件须与声明输入一致'})),
 ])])
 expect(observed).toEqual({hostAttempts:1,hostRejected:1,sdkRejected:1,outputLimitNotExecuted:1,source:'host-and-transcript',complete:true})
})
it.each(['accepted','blocked'])('recognizes a recorded %s host submission',state=>{
 expect(researchSubmissionDiagnostics({hostAttempts:1,hostRejected:0},[scope([
  call('host'),result('host',JSON.stringify({recorded:true,state}),false),
 ])])).toEqual({hostAttempts:1,hostRejected:0,sdkRejected:0,outputLimitNotExecuted:0,source:'host-and-transcript',complete:true})
})
it('keeps reliable host counts and omits transcript counts when no transcript exists',()=>{
 for(const scopes of [undefined,[]])expect(researchSubmissionDiagnostics({hostAttempts:2,hostRejected:1},scopes)).toEqual({hostAttempts:2,hostRejected:1,source:'host-only',complete:false})
})
it('records reliable zeros for a complete transcript without submission calls',()=>{
 expect(researchSubmissionDiagnostics(host,[scope([])])).toEqual({...host,sdkRejected:0,outputLimitNotExecuted:0,source:'host-and-transcript',complete:true})
})
it('ignores user messages, assistant quotations, non-message wrappers and ordinary read results containing fake labels',()=>{
 const fake=JSON.stringify({recorded:false})+'\n'+sdkRejected+'\n'+outputLimit
 const entries=[message({role:'user',content:fake}),message({role:'assistant',content:[{type:'text',text:fake}]}),
  {type:'custom',message:{role:'toolResult',toolName:'submit_task_result',toolCallId:'fake',content:[{type:'text',text:sdkRejected}]}},
  call('read','read'),result('read',fake,true,'read')]
 expect(researchSubmissionDiagnostics(host,[scope(entries)])).toEqual({...host,sdkRejected:0,outputLimitNotExecuted:0,source:'host-and-transcript',complete:true})
})
it.each([undefined,'','   '])('does not infer a submission match with a missing call id %s',id=>{
 unknown([call(id),result(id,sdkRejected)])
})
it('does not count orphan submission results or assistant calls without results',()=>{
 unknown([result('orphan',sdkRejected)])
 unknown([call('unfinished')])
})
it('does not match an earlier result to a later declaration',()=>{
 unknown([result('later',sdkRejected),call('later')])
})
it('does not treat the wrong result tool name as a submission outcome',()=>{
 unknown([call('wrong'),result('wrong',sdkRejected,true,'read')])
})
it('marks duplicate declarations or results ambiguous without double counting',()=>{
 unknown([call('same'),call('same'),result('same',sdkRejected)])
 unknown([call('same'),result('same',sdkRejected),result('same',sdkRejected)])
 unknown([call('same','read'),call('same'),result('same',sdkRejected)])
})
it('keeps identical call ids separate across distinct scopes',()=>{
 expect(researchSubmissionDiagnostics(host,[scope([call('same'),result('same',sdkRejected)],true,'a'),scope([call('same'),result('same',outputLimit)],true,'b')]))
  .toEqual({...host,sdkRejected:1,outputLimitNotExecuted:1,source:'host-and-transcript',complete:true})
})
it('never matches a declaration with a result from another scope',()=>{
 const observed=researchSubmissionDiagnostics(host,[scope([call('same')],true,'a'),scope([result('same',sdkRejected)],true,'b')])
 expect(observed).toEqual({...host,source:'host-and-transcript',complete:false})
})
it('marks duplicate or empty scope identities ambiguous',()=>{
 for(const scopes of [[scope([],true,'same'),scope([],true,'same')],[scope([],true,'')]]){
  expect(researchSubmissionDiagnostics(host,scopes)).toEqual({...host,source:'host-and-transcript',complete:false})
 }
})
it('omits uncertain counts when any transcript scope is incomplete',()=>{
 unknown([call('sdk'),result('sdk',sdkRejected)],false)
 unknown([],false)
})
it.each(['Something failed','', 'Validation failed for tool "other": invalid', 'Validation failed for tool "submit_task_result":',outputLimit.slice(0,-10),'{"recorded":false',JSON.stringify({state:'accepted'})])('does not classify an unknown or truncated result: %s',text=>{
 unknown([call('unknown'),result('unknown',text)])
})
it('does not classify embedded SDK quotations or labels in arbitrary result JSON',()=>{
 for(const text of ['Example: '+sdkRejected,'> '+outputLimit,JSON.stringify({error:sdkRejected}),JSON.stringify({error:outputLimit})])unknown([call('quoted'),result('quoted',text)])
})
it('does not classify SDK error text as an error when the result explicitly succeeded',()=>{
 unknown([call('sdk'),result('sdk',sdkRejected,false)])
 unknown([call('limit'),result('limit',outputLimit,false)])
})
it('does not accept multiple content blocks as one authoritative result',()=>{
 unknown([call('multiple'),message({role:'toolResult',toolCallId:'multiple',toolName:'submit_task_result',isError:true,content:[{type:'text',text:sdkRejected},{type:'text',text:outputLimit}]})])
})
it('does not claim complete transcript coverage when host observations disagree',()=>{
 expect(researchSubmissionDiagnostics({hostAttempts:1,hostRejected:0},[scope([])]))
  .toEqual({hostAttempts:1,hostRejected:0,source:'host-and-transcript',complete:false})
 expect(researchSubmissionDiagnostics({hostAttempts:1,hostRejected:1},[scope([call('host'),result('host',JSON.stringify({recorded:true,state:'accepted'}),false)])]))
  .toEqual({hostAttempts:1,hostRejected:1,source:'host-and-transcript',complete:false})
})
it.each([null,{type:'message'},message({role:'assistant'}),message({role:'assistant',content:[{type:'toolCall',id:'missing-name'}]}),message({role:'toolResult',toolCallId:'missing-name',content:[]})])('does not infer complete coverage from malformed Pi message entries',entry=>{
 unknown([entry])
})
it('omits counts for a result explicitly marked truncated even if the surviving text looks complete',()=>{
 const cropped=result('cropped',sdkRejected)
 unknown([call('cropped'),{...cropped,message:{...cropped.message,truncated:true}}])
})
it('classifies the installed SDK validation format including the complete Received arguments JSON suffix',()=>{
 const text=sdkValidationLines+'\n\nReceived arguments:\n'+JSON.stringify({data:{kind:'review',verdict:'pass',findings:[]}},null,2)
 expect(researchSubmissionDiagnostics(host,[scope([call('full'),result('full',text)])]))
  .toEqual({...host,sdkRejected:1,outputLimitNotExecuted:0,source:'host-and-transcript',complete:true})
})
it('recognizes the SDK validator fallback without guessing from arbitrary errors',()=>{
 const text='Validation failed for tool "submit_task_result":\nUnknown validation error\n\nReceived arguments:\n{}'
 expect(researchSubmissionDiagnostics(host,[scope([call('fallback'),result('fallback',text)])]))
  .toEqual({...host,sdkRejected:1,outputLimitNotExecuted:0,source:'host-and-transcript',complete:true})
})
it('does not classify a cropped SDK Received arguments body',()=>{
 unknown([call('cropped-args'),result('cropped-args',sdkValidationLines+'\n\nReceived arguments:\n{"data":')])
})
it('recognizes the installed SDK harness output-limit nonexecution template',()=>{
 const text='Tool call "submit_task_result" was not executed because the assistant response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.'
 expect(researchSubmissionDiagnostics(host,[scope([call('harness'),result('harness',text)])]))
  .toEqual({...host,sdkRejected:0,outputLimitNotExecuted:1,source:'host-and-transcript',complete:true})
})

it('does not mistake the saved abbreviated summary for a complete SDK result',()=>{
 unknown([call('summary'),result('summary',sdkValidationLines)])
})
it.each([{}, {role:'unknown',content:[]}, {role:'assistant',content:[null]},
 {role:'assistant',content:[{}]}, {role:'assistant',content:[{type:'unknown'}]},
 {role:'assistant',content:[{type:'text'}]}, {role:'assistant',content:[{type:'thinking'}]},
 {role:'assistant',content:[],truncated:true},
 {role:'assistant',content:[{type:'text',text:'surviving text',truncated:true}]},
])('does not report reliable zeros for incomplete message envelopes or assistant content: %j',value=>{
 unknown([message(value)])
})
it('does not classify paired submission outcomes from an explicitly truncated assistant declaration',()=>{
 const declared=call('truncated-declaration')
 unknown([{...declared,message:{...declared.message,truncated:true}},result('truncated-declaration',sdkRejected)])
})
it('ignores valid ordinary Pi roles and non-message session metadata',()=>{
 const entries=[{type:'session',version:3},{type:'model_change',provider:'fixture',modelId:'fixture'},
  message({role:'system',content:'system instructions'}),message({role:'user',content:'user request'}),
  message({role:'custom',customType:'fixture',content:'custom context',display:false}),
  message({role:'bashExecution',command:'fixture',output:'cropped output',exitCode:0,cancelled:false,truncated:true}),
  message({role:'branchSummary',summary:'branch summary',fromId:null}),
  message({role:'compactionSummary',summary:'compact summary',tokensBefore:100}),
  message({role:'assistant',content:[{type:'text',text:'ordinary answer'},{type:'thinking',thinking:'reasoning'}]}),
 ]
 expect(researchSubmissionDiagnostics(host,[scope(entries)]))
  .toEqual({...host,sdkRejected:0,outputLimitNotExecuted:0,source:'host-and-transcript',complete:true})
})
it('does not classify a submission result whose text block is explicitly truncated',()=>{
 for(const text of [sdkRejected,outputLimit,JSON.stringify({recorded:false})]){
  unknown([call('cropped-block'),message({role:'toolResult',toolCallId:'cropped-block',toolName:'submit_task_result',isError:true,content:[{type:'text',text,truncated:true}]})])
 }
})

it('rejects an adversarial SDK header within a bounded isolated subprocess',async()=>{
 const text='Validation failed for tool "submit_task_result":\n'+'  - '.repeat(40)+'a\nX\n\nReceived arguments:\n{}'
 const code=`import {researchSubmissionDiagnostics} from ${JSON.stringify(new URL('../../src/evaluation/research-submissions.ts',import.meta.url).href)};process.stdout.write(JSON.stringify(researchSubmissionDiagnostics(${JSON.stringify(host)},${JSON.stringify([scope([call('adversarial'),result('adversarial',text)])])})))`
 const output=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',code],{timeout:2000,maxBuffer:1024*1024})
 expect(JSON.parse(output.stdout)).toEqual({...host,source:'host-and-transcript',complete:false})
},5000)
it.each([{}, {type:''}, {type:'   '}, {type:3}])('does not infer reliable zeros from missing or malformed entry types: %j',entry=>{
 unknown([entry])
})
it.each([
 {role:'system'}, {role:'user',content:[null]}, {role:'custom',content:'context'},
 {role:'branchSummary'}, {role:'compactionSummary',summary:'summary'},
 {role:'bashExecution',output:'output'},
 {role:'toolResult',toolName:'read',toolCallId:'ordinary-read'},
 {role:'toolResult',toolName:'read',toolCallId:'ordinary-read',content:[null],isError:false},
])('does not infer reliable zeros from malformed ordinary messages: %j',value=>{
 unknown([message(value)])
})
it('preserves valid ordinary image content without interpreting it as submission evidence',()=>{
 const image={type:'image',data:'fixture',mimeType:'image/png'}
 const entries=[message({role:'user',content:[image]}),
  message({role:'custom',customType:'fixture',display:false,content:[image]}),
  call('image-read','read'),message({role:'toolResult',toolName:'read',toolCallId:'image-read',content:[image],isError:false})]
 expect(researchSubmissionDiagnostics(host,[scope(entries)]))
  .toEqual({...host,sdkRejected:0,outputLimitNotExecuted:0,source:'host-and-transcript',complete:true})
})
