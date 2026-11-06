import {afterEach,expect,it,vi} from 'vitest'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {ElectronApplication} from '@playwright/test'
import {observeElectronExit} from '../../e2e/electron-exit-diagnostics.js'
const roots:string[]=[]
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
function setup(){
 vi.stubEnv('DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR','')
 const dir=mkdtempSync(join(tmpdir(),'dawn-exit-observer-'));roots.push(dir)
 const child=Object.assign(new EventEmitter(),{pid:undefined,exitCode:null as number|null,signalCode:null,stdout:new PassThrough(),stderr:new PassThrough()})
 const evaluate=vi.fn(),context=new EventEmitter(),page=new EventEmitter()
 const app=Object.assign(new EventEmitter(),{process:()=>child,evaluate,context:()=>context,windows:()=>[page]}) as unknown as ElectronApplication&EventEmitter
 const records=()=>readdirSync(dir).filter(n=>n.endsWith('.jsonl')).flatMap(name=>readFileSync(join(dir,name),'utf8').trim().split('\n').map(line=>JSON.parse(line)))
 return{dir,child,evaluate,app,context,page,records}
}
it('default diagnostics capture a stalled close without injecting app handlers or altering its budget',async()=>{
 vi.useFakeTimers();const {dir,app,evaluate,records}=setup()
 const observation=await observeElectronExit(app,dir)
 await observation.appReady();observation.beginClose()
 await vi.advanceTimersByTimeAsync(5000)
 expect(records().map(r=>r.event)).toContain('still-waiting-5s')
 expect(evaluate).not.toHaveBeenCalled()
})
it('normal child close clears the passive watchdog and preserves the real exit result',async()=>{
 vi.useFakeTimers();const {dir,app,child,records}=setup()
 const observation=await observeElectronExit(app,dir);observation.beginClose()
 child.exitCode=0;child.emit('exit',0,null);child.emit('close',0,null)
 await vi.advanceTimersByTimeAsync(5000)
 expect(records().find(r=>r.event==='child-close')?.detail).toMatchObject({exitCode:0,signalCode:null})
 expect(records().some(r=>r.event==='still-waiting-5s')).toBe(false)
})
it('distinguishes a closed protocol/page from a still-live native process and records close returning',async()=>{
 const{dir,app,child,context,page,records}=setup()
 const observation=await observeElectronExit(app,dir)
 page.emit('crash');page.emit('close');context.emit('close');app.emit('close')
 observation.beginClose();observation.closeReturned()
 expect(child.exitCode).toBeNull()
 expect(records().map(r=>r.event)).toEqual(expect.arrayContaining(['page-crash','page-close','context-close','app-protocol-close','close-call-returned']))
 expect(records().find(r=>r.event==='close-call-returned')?.detail).toMatchObject({exitCode:null,signalCode:null,contextClosed:true,appClosed:true})
 child.exitCode=0;child.emit('exit',0,null);child.emit('close',0,null)
})
it('keeps only safe inspector lifecycle markers from stderr',async()=>{
 const{dir,app,child,records}=setup();await observeElectronExit(app,dir)
 child.stderr.write('SECRET normal stderr body\nDebugger ending on ws://127.0.0.1/private-token\nWaiting for the debugger to disconnect...\n')
 expect(records().map(r=>r.event)).toEqual(expect.arrayContaining(['inspector-ending','inspector-waiting-disconnect']))
 expect(JSON.stringify(records())).not.toContain('SECRET');expect(JSON.stringify(records())).not.toContain('private-token')
 child.exitCode=0;child.emit('exit',0,null);child.emit('close',0,null)
})
it('cannot break fixture shutdown when the diagnostic directory is unwritable',async()=>{
 const{dir,app}=setup(),file=join(dir,'file');writeFileSync(file,'fixture')
 await expect(observeElectronExit(app,file)).resolves.toHaveProperty('closeReturned')
})
it.each(['shutdown-drain-timeout','shutdown-drain-failed','shutdown-async-failed','shutdown-fallback-fired'])('exit code zero cannot conceal %s in desktop acceptance',async event=>{
 const{dir,app,child}=setup(),observation=await observeElectronExit(app,dir)
 writeFileSync(join(dir,`app-${child.pid}.jsonl`),JSON.stringify({event:'diagnostics-attached'})+'\n'+JSON.stringify({event})+'\n')
 child.exitCode=0;child.emit('exit',0,null);child.emit('close',0,null)
 expect(observation.shutdownProblems()).toEqual([event])
})
it('only checks the current native process instance in a shared diagnostic directory',async()=>{
 const{dir,app,child}=setup(),observation=await observeElectronExit(app,dir)
 const events=['diagnostics-attached','shutdown-fallback-fired','diagnostics-attached','shutdown-drained']
 writeFileSync(join(dir,`app-${child.pid}.jsonl`),events.map(event=>JSON.stringify({event})).join('\n')+'\n')
 expect(observation.shutdownProblems()).toEqual([])
 child.exitCode=0;child.emit('exit',0,null);child.emit('close',0,null)
})
it('reports unreadable native facts as an acceptance problem instead of claiming graceful drain',async()=>{
 const{dir,app,child}=setup(),observation=await observeElectronExit(app,dir)
 writeFileSync(join(dir,`app-${child.pid}.jsonl`),'truncated JSON')
 expect(observation.shutdownProblems()).toEqual(['shutdown-diagnostics-unreadable'])
 child.exitCode=0;child.emit('exit',0,null);child.emit('close',0,null)
})
it('missing native facts are unknown, not proof of a clean shutdown',async()=>{
 const{dir,app,child}=setup(),observation=await observeElectronExit(app,dir)
 child.exitCode=0;child.emit('exit',0,null);child.emit('close',0,null)
 expect(observation.shutdownProblems()).toEqual(['shutdown-diagnostics-unavailable'])
})
it('an asynchronous shutdown without a reported drain outcome is incomplete',async()=>{
 const{dir,app,child}=setup(),observation=await observeElectronExit(app,dir)
 writeFileSync(join(dir,`app-${child.pid}.jsonl`),['diagnostics-attached','shutdown-async-start','process-exit'].map(event=>JSON.stringify({event})).join('\n')+'\n')
 expect(observation.shutdownProblems()).toEqual(['shutdown-outcome-unobserved'])
 child.exitCode=0;child.emit('exit',0,null);child.emit('close',0,null)
})
