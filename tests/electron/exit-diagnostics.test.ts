import {afterEach,expect,it,vi} from 'vitest'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs'
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
 const evaluate=vi.fn(),app={process:()=>child,evaluate} as unknown as ElectronApplication
 const records=()=>readdirSync(dir).filter(n=>n.endsWith('.jsonl')).flatMap(name=>readFileSync(join(dir,name),'utf8').trim().split('\n').map(line=>JSON.parse(line)))
 return{dir,child,evaluate,app,records}
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
