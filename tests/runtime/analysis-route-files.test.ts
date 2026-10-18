import { describe, expect,it } from 'vitest'
import { mkdtempSync,writeFileSync,rmSync,symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {join} from 'node:path'
import {routeDeliverableEvidence} from '../../src/runtime/analysis-route-files.js'
import {AnalysisRouteBook} from '../../src/runtime/analysis-route-book.js'
const step=(id:string)=>({id,title:id,purpose:'p',inputs:[],outputs:[],dependencies:[],status:'pending' as const,blockers:[],cases:[],deliverables:[{path:'out.txt'}],execution:{state:'not_run' as const,note:'n'},verification:{state:'unreviewed' as const,note:'n'},needsReview:false,notes:[]})
describe('route output attribution',()=>{
 it('only marks exact producing paths from the same step observed; read paths remain existence facts',()=>{
  const dir=mkdtempSync(join(tmpdir(),'route-files-'));try{
   writeFileSync(join(dir,'out.txt'),'x');const route=new AnalysisRouteBook(undefined).replace(0,{title:'r',goal:'g',dataContext:[],steps:[step('S1'),step('S2')]})
   const facts=routeDeliverableEvidence(route,[{toolCallId:'w',name:'write',status:'done',result:'ok',input:{path:'out.txt'},stepId:'S2'}],dir,false)
   expect(facts).toEqual([{stepId:'S1',path:'out.txt',state:'exists'},{stepId:'S2',path:'out.txt',state:'observed'}])
   expect(routeDeliverableEvidence(route,[{toolCallId:'r',name:'read',status:'done',result:'x',input:{path:'out.txt'},stepId:'S1'}],dir,false)[0]!.state).toBe('exists')
   expect(routeDeliverableEvidence(route,[],dir,true)[0]!.state).toBe('unknown')
   rmSync(join(dir,'out.txt'));expect(routeDeliverableEvidence(route,[],dir,false)[0]!.state).toBe('missing')
   symlinkSync('/etc/hosts',join(dir,'out.txt'));expect(routeDeliverableEvidence(route,[],dir,false)[0]!.state).toBe('unknown')
  }finally{rmSync(dir,{recursive:true,force:true})}
 })
})
