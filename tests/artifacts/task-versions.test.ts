import {afterEach,expect,it} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {captureFileVersions,assertFileVersions,finalizeTaskVersions} from '../../src/artifacts/task-versions.js'
import {TaskContractSchema,TaskSettingsSchema} from '../../src/protocol/task-contract.js'
import {resolveTaskSettings} from '../../src/subagent/task-tools.js'
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})})
function root(){const p=mkdtempSync(join(tmpdir(),'dawn-versioned-'));roots.push(p);return p}
it('binds actual bytes, detects same-size replacements and preserves a detached snapshot',async()=>{
 const cwd=root();writeFileSync(join(cwd,'in.csv'),'x\n1\n')
 const versions=await captureFileVersions(cwd,['in.csv']);expect(versions[0]).toMatchObject({path:'in.csv',bytes:4,sha256:expect.stringMatching(/^[a-f0-9]{64}$/)})
 await expect(assertFileVersions(cwd,versions)).resolves.toBeUndefined()
 writeFileSync(join(cwd,'in.csv'),'x\n2\n');await expect(assertFileVersions(cwd,versions)).rejects.toThrow(/版本/)
 expect(versions[0]?.bytes).toBe(4)
})
it('refuses missing, linked, canceled and over-budget captures without producing a partial manifest',async()=>{
 const cwd=root();writeFileSync(join(cwd,'file.csv'),'12345');symlinkSync(join(cwd,'file.csv'),join(cwd,'alias.csv'))
 await expect(captureFileVersions(cwd,['missing.csv'])).rejects.toThrow()
 await expect(captureFileVersions(cwd,['alias.csv'])).rejects.toThrow()
 const controller=new AbortController();controller.abort();await expect(captureFileVersions(cwd,['file.csv'],controller.signal)).rejects.toThrow()
 await expect(captureFileVersions(cwd,['file.csv'],undefined,{maxFileBytes:4})).rejects.toThrow(/上限/)
 await expect(captureFileVersions(cwd,['file.csv','file.csv'])).rejects.toThrow(/重复/)
})
it('version settings bind every contract input and host finalization rejects absent or stale submission proof',async()=>{
 const cwd=root();writeFileSync(join(cwd,'in.csv'),'x\n1');writeFileSync(join(cwd,'out.csv'),'x\n2')
 const contract=TaskContractSchema.parse({submission:'tool',access:'workspace-write',inputs:['in.csv'],outputs:['out.csv']})
 const inputs=await captureFileVersions(cwd,contract.inputs),settings={...resolveTaskSettings(contract,'allow-all'),versions:{version:1 as const,inputs}}
 expect(TaskSettingsSchema.safeParse({...settings,versions:{version:1,inputs:[]}}).success).toBe(false)
 const receipt={version:1 as const,state:'accepted' as const,summary:'done',deliverables:[{stepId:'task',path:'out.csv',state:'exists' as const}]}
 const sealed=await finalizeTaskVersions(settings,receipt,cwd)
 expect(sealed.versions?.outputs[0]?.path).toBe('out.csv')
 expect((await finalizeTaskVersions(settings,receipt,cwd,undefined,{required:true})).state).toBe('blocked')
 expect((await finalizeTaskVersions(settings,receipt,cwd,undefined,{required:true,submitted:sealed.versions})).state).toBe('accepted')
 writeFileSync(join(cwd,'out.csv'),'x\n3')
 expect((await finalizeTaskVersions(settings,receipt,cwd,undefined,{required:true,submitted:sealed.versions})).state).toBe('blocked')
})
it('records verified identities in the existing artifact version tables and keeps other projects isolated',async()=>{
 const {default:Database}=await import('better-sqlite3'),{migrate}=await import('../../src/store/schema.js'),{ArtifactStore}=await import('../../src/artifacts/store.js'),{ArtifactCapture}=await import('../../src/artifacts/capture.js')
 const db=new Database(':memory:');migrate(db);const cwd=root(),store=new ArtifactStore(db),scope={projectId:'study',workspace:cwd,sessionId:'parent'}
 const {ProjectStore}=await import('../../src/store/projects.js');new ProjectStore(db).insert({projectId:'study',name:'study',workspace:cwd,createdAt:new Date().toISOString()})
 writeFileSync(join(cwd,'in.csv'),'x\n1');const inputs=await captureFileVersions(cwd,['in.csv'])
 try{
  const capture=new ArtifactCapture({store,scope:()=>scope}),versions=capture.recordTaskVersions('parent',{version:1,inputs,outputs:[]})
  const first=versions.inputs[0]!;expect(first.versionId).toBeTruthy();expect(store.observation(scope,first.observationId!).sha256).toBe(inputs[0]?.sha256)
  expect(()=>store.observation({...scope,projectId:'another'},first.observationId!)).toThrow()
  expect(capture.recordTaskVersions('parent',{version:1,inputs,outputs:[]}).inputs[0]?.versionId).toBe(first.versionId)
  expect(db.prepare('SELECT count(*) AS n FROM artifact_versions').get()).toEqual({n:1})
 }finally{db.close()}
})
