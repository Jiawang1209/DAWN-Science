import {afterEach,expect,it} from 'vitest'
import {EventEmitter} from 'node:events'
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {installAppExitDiagnostics} from '../../src/electron/exit-diagnostics.js'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function setup(){
 const dir=mkdtempSync(join(tmpdir(),'dawn-native-exit-'));roots.push(dir)
 const app=new EventEmitter(),host=Object.assign(new EventEmitter(),{pid:42,getActiveResourcesInfo:()=>['Timeout','PipeWrap','private request body']})
 const records=()=>readdirSync(dir).filter(file=>file.endsWith('.jsonl')).flatMap(file=>readFileSync(join(dir,file),'utf8').trim().split('\n').map(line=>JSON.parse(line)))
 return{dir,app,host,records}
}
it('leaves normal installed applications uninstrumented when no diagnostic directory is supplied',()=>{
 const{app,host,records}=setup()
 const mark=installAppExitDiagnostics(app,undefined,host)
 mark('shutdown-sync-start');app.emit('before-quit');host.emit('exit',0)
 expect(app.eventNames()).toEqual([]);expect(host.eventNames()).toEqual([]);expect(records()).toEqual([])
})
it('writes early application, renderer and shutdown facts without inspector or private content',()=>{
 const{dir,app,host,records}=setup(),mark=installAppExitDiagnostics(app,dir,host)
 const window=Object.assign(new EventEmitter(),{id:7}),contents=Object.assign(new EventEmitter(),{id:9})
 app.emit('browser-window-created',{},window);app.emit('web-contents-created',{},contents)
 contents.emit('render-process-gone',{}, {reason:'crashed',exitCode:139,url:'SECRET_URL'})
 window.emit('close',{});window.emit('closed');app.emit('before-quit',{});app.emit('will-quit',{})
 mark('shutdown-async-start');mark('shutdown-async-complete');app.emit('quit',{},0);host.emit('exit',0)
 const facts=records()
 expect(facts.map(r=>r.event)).toEqual(['diagnostics-attached','window-created','contents-created','renderer-gone','window-close','window-closed','before-quit','will-quit','shutdown-async-start','shutdown-async-complete','quit','process-exit'])
 expect(facts.map(r=>r.seq)).toEqual(facts.map((_,i)=>i+1))
 expect(facts.every(r=>r.pid===42&&r.ms>=0&&typeof r.at==='string')).toBe(true)
 expect(facts[0].resources).toEqual({Timeout:1,PipeWrap:1,Other:1})
 expect(JSON.stringify(facts)).not.toContain('SECRET_URL');expect(JSON.stringify(facts)).not.toContain('private request body')
})
it('a diagnostic write failure cannot throw into the shutdown handlers',()=>{
 const{dir,app,host}=setup(),file=join(dir,'not-a-directory');writeFileSync(file,'fixture')
 expect(()=>{
  const mark=installAppExitDiagnostics(app,file,host)
  app.emit('before-quit',{});mark('shutdown-sync-start');host.emit('exit',0)
 }).not.toThrow()
})
it('preserves lifecycle facts when resource inspection is unavailable',()=>{
 const{dir,app,host,records}=setup();host.getActiveResourcesInfo=()=>{throw new Error('resource probe failed')}
 installAppExitDiagnostics(app,dir,host);app.emit('before-quit',{});host.emit('exit',0)
 expect(records().map(row=>row.event)).toEqual(['diagnostics-attached','before-quit','process-exit'])
 expect(records().every(row=>row.resourceSnapshotAvailable===false)).toBe(true)
})
