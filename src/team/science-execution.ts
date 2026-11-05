import {sciencePythonBootstrap} from './science-python-bootstrap.js'
import {killOwnedProcessTree} from '../runtime/process-tree.js'
/** Fixed interpreter invocation for explicitly recognized template commands, after ordinary authorization. */
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {fileIdentity} from '../artifacts/blobs.js'
import type {ScienceAcceptance} from '../protocol/science-acceptance.js'
import type {RouteToolEvidence} from '../runtime/analysis-route-evidence.js'
import {probeScienceEnvironment,isolatedScriptCommand} from './science-environment.js'
export async function runControlledScience(spec:ScienceAcceptance|undefined,cwd:string,params:Record<string,unknown>,signal?:AbortSignal,declaredPaths:readonly string[]=[]):Promise<{content:{type:string;text:string}[];isError?:boolean;details?:unknown;scienceExecution?:RouteToolEvidence['scienceExecution']}|undefined>{
 if(spec?.environment?.language==='r')return // Ordinary R execution remains available; no unverified reuse proof.
 if(!spec?.environment||!isolatedScriptCommand(spec.environment.language,spec.scriptPath,params.command))return
 if(signal?.aborted)throw new Error('受控执行已取消')
 const before=await probeScienceEnvironment(spec.environment.language,cwd,signal)
 if(before.state!=='known'||!before.executable||spec.environment.state==='known'&&before.fingerprint!==spec.environment.fingerprint)throw new Error('隔离解释器环境未知或已变化，未执行')
 const options={maxBytes:2*1024*1024,timeoutMs:5000,...(signal?{signal}:{})},script=await fileIdentity(cwd,spec.scriptPath,options)
 const timeout=typeof params.timeout==='number'&&Number.isFinite(params.timeout)?Math.max(1,Math.min(600,params.timeout)):120
 // The trusted epilogue holds the interpreter alive. Snapshot descendants BEFORE
 // interpreter exit, including children that created a separate session/group.
 const marker=`DAWN_SCIENCE_DONE_${randomUUID().replaceAll('-','')}:`
 const python=sciencePythonBootstrap(spec.scriptPath,[...new Set([spec.scriptPath,spec.resultPath,spec.reportPath,...(spec.numeric?[spec.numeric.dataPath]:[]),...declaredPaths])],marker)
 const result=await new Promise<{text:string;failed:boolean;dependenciesBound:boolean}>((resolve,reject)=>{
  const child=spawn(before.executable!,['-I','-B','-c',python],{cwd,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true})
  const chunks:Buffer[]=[];let size=0,failure:string|undefined,spawnError:Error|undefined,completedCode:number|undefined,dependenciesBound=false
  const stop=(reason:string)=>{failure??=reason;killOwnedProcessTree(child)}
  const abort=()=>stop('受控执行已取消')
  const timer=setTimeout(()=>stop('受控执行超时'),timeout*1000)
  const data=(chunk:Buffer)=>{size+=chunk.length;if(size>2*1024*1024){stop('受控执行输出超过 2 MiB 上限');return}chunks.push(chunk);const text=Buffer.concat(chunks).toString('utf8'),done=text.indexOf('\n'+marker);if(done>=0&&text.indexOf('\n',done+marker.length+1)>=0){const match=/^(-?\d+):([01])$/.exec(text.slice(done+marker.length+1).split('\n')[0]!);if(match){completedCode=Number(match[1]);dependenciesBound=match[2]==='1';killOwnedProcessTree(child)}}}
  child.stdout.on('data',data);child.stderr.on('data',data)
  child.once('error',error=>{spawnError=error})
  // Reap background work even if the script exits normally and descendants close their stdio.
  child.once('exit',()=>killOwnedProcessTree(child))
  child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(signal?.aborted){reject(new Error('受控执行已取消'));return}const output=Buffer.concat(chunks).toString('utf8'),end=output.indexOf('\n'+marker);resolve({text:[end>=0?output.slice(0,end):output,failure,spawnError?.message,completedCode===undefined?`受控解释器未完成排空握手（退出 ${code}）；须核对未知副作用`:completedCode!==0?`脚本退出 ${completedCode}`:undefined].filter(Boolean).join('\n'),failed:!!failure||!!spawnError||completedCode!==0,dependenciesBound})})
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
 })
 if(signal?.aborted)throw new Error('受控执行已取消')
 const after=await probeScienceEnvironment(spec.environment.language,cwd,signal),actual=await fileIdentity(cwd,spec.scriptPath,options)
 const stable=!result.failed&&result.dependenciesBound&&after.state==='known'&&after.fingerprint===before.fingerprint&&actual.sha256===script.sha256&&actual.bytes===script.bytes
 return{content:[{type:'text',text:result.text||'受控解释器执行完成（无标准输出）'}],...(result.failed?{isError:true}:{}),...(stable?{scienceExecution:{script:{path:spec.scriptPath,sha256:script.sha256,bytes:script.bytes},environmentFingerprint:before.fingerprint!,dependencyBound:true}}:{})}
}
