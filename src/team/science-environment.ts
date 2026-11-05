/** Fixed metadata probe, separate admission and final snapshots; never backfill history. */
import {execFile} from 'node:child_process'
import {environmentProbeFor,parseEnvironmentFor,fingerprintOf} from '../kernel/environment.js'
import type {RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import type {ScienceEnvironment} from '../protocol/science-reuse.js'
export async function probeScienceEnvironment(language:'python'|'r',cwd:string,signal?:AbortSignal):Promise<ScienceEnvironment>{
 if(signal?.aborted)throw new Error('环境核验已取消')
 const lang=language==='r'?'R':'python',expression=environmentProbeFor(lang)!
 try{
  const raw=await new Promise<string>((resolve,reject)=>execFile(language==='r'?'Rscript':'python3',language==='r'?['--vanilla','-e',`cat(${expression})`]:['-I','-c',`print(${expression})`],{cwd,timeout:5000,maxBuffer:2*1024*1024,signal},(error,stdout)=>error?reject(error):resolve(stdout)))
  if(signal?.aborted)throw new Error('环境核验已取消')
  const snapshot=parseEnvironmentFor(lang,raw)
  if(!snapshot||!snapshot.version||!snapshot.executable||snapshot.platform.startsWith('（')||!Number.isSafeInteger(snapshot.packagesTotal)||snapshot.packagesTotal!==snapshot.packages.length||snapshot.packages.some(p=>!p.name||!p.version||p.name==='?'||p.version==='?'))return{state:'unknown',language,reason:'环境清单不完整，不能复用历史结果'}
  return{state:'known',language,executable:snapshot.executable,fingerprint:fingerprintOf(snapshot)}
 }catch(error){if(signal?.aborted)throw new Error('环境核验已取消');return{state:'unknown',language,reason:'固定解释器环境探测未完成，不能复用历史结果'}}
}
export function isolatedScriptCommand(language:'python'|'r',script:string,command:unknown):boolean {
 if(!/^[\w./ -]+$/.test(script)||script.includes('..'))return false
 const invocation=language==='r'?'Rscript --vanilla':'python3 -I'
 return typeof command==='string'&&[`${invocation} ${script}`,`${invocation} '${script}'`,`${invocation} "${script}"`].includes(command.trim())
}
export function boundScriptExecution(language:'python'|'r',script:string,evidence:readonly RouteToolEvidence[],version?:{sha256:string;bytes:number},fingerprint?:string):boolean {
 return evidence.some(e=>e.name==='bash'&&e.status==='done'&&e.execution==='ran'&&e.input&&typeof e.input==='object'&&isolatedScriptCommand(language,script,(e.input as {command?:unknown}).command)&&e.scienceExecution?.dependencyBound===true&&e.scienceExecution.script.path===script&&!!version&&e.scienceExecution.script.sha256===version.sha256&&e.scienceExecution.script.bytes===version.bytes&&!!fingerprint&&e.scienceExecution.environmentFingerprint===fingerprint)
}
