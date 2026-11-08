import {readFileSync,statSync} from 'node:fs'
import {researchBatchAllocation} from '../src/evaluation/research-batch.js'
import {researchRequestLimit} from '../src/evaluation/research-budget.js'
/** Explicit opt-in only. Default evaluate:science never reads a real credential. */
import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
import {createRequire} from 'node:module'
export async function runCurrentApiResearch(args:string[]){
 const [output,profile,provider,model,variant,requestLimitArg,batchFile]=args
 if((args.length<4||args.length>7)||variant!==undefined&&!['approved-plan','automatic-plan'].includes(variant)||!output||!profile||!provider||!model)throw new Error('用法：--research-current-api OUTPUT PROFILE PROVIDER MODEL [approved-plan|automatic-plan] [TOTAL_LIMIT] [BATCH_JSON]（默认30，范围4..300）')
 if(batchFile!==undefined&&!batchFile.trim())throw new Error('评测批次文件名不能为空；请检查用法')
 const requestLimit=researchRequestLimit(requestLimitArg===undefined?undefined:Number(requestLimitArg))
 // Staged live trials need at least two requests per arm; reject before host build/credential access.
 let batchRaw:unknown
 if(batchFile){if(statSync(batchFile).size>16384)throw new Error('评测批次配置过大');const raw=readFileSync(batchFile,'utf8');if(Buffer.byteLength(raw)>16384)throw new Error('评测批次配置过大');batchRaw=JSON.parse(raw)}
 const batch=researchBatchAllocation(batchRaw,requestLimit)
 const entry=resolve('dist/electron/evaluate-current-api.js')
 await build({entryPoints:['scripts/evaluate-current-api.ts'],outfile:entry,bundle:true,platform:'node',format:'esm',target:'node22',packages:'external'})
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const binary:unknown=createRequire(import.meta.url)('electron')
 if(typeof binary!=='string')throw new Error('当前进程不是 Node 评测宿主')
 const code=await new Promise<number>((resolve,reject)=>{
  const child=spawn(binary,[entry,resolvePath(output),resolvePath(profile),provider,model,...(variant?[variant,String(requestLimit),...(batchFile?[JSON.stringify(batch)]:[])]:[])],{env,stdio:'inherit'}),cancel=()=>child.kill('SIGINT')
  process.on('SIGINT',cancel);process.on('SIGTERM',cancel)
  const cleanup=()=>{process.off('SIGINT',cancel);process.off('SIGTERM',cancel)}
  child.once('error',error=>{cleanup();reject(error)});child.once('close',code=>{cleanup();resolve(code??1)})
 })
 if(code)throw new Error('真实 API 试验未完成，保留报告；不自动重试')
}
const resolvePath=(path:string)=>resolve(path)
