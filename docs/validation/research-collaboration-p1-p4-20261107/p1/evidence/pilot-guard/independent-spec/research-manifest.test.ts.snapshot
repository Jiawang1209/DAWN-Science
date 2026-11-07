import {expect,it} from 'vitest'
import {researchModelDeclaration,researchManifest,researchStageDeclarations} from '../../src/evaluation/research-manifest.js'
import {researchTasks} from '../../src/evaluation/research-tasks.js'
it('records only declared inference settings and never copies endpoints or credentials',()=>{
 const config={providers:{deepseek:{baseUrl:'https://private.invalid',apiKey:'private-value',headers:{authorization:'secret'},api:'openai-completions',models:[{id:'m',reasoning:false,maxTokens:4096,input:['text'],compat:{maxTokensField:'max_tokens'},cost:{input:0}}]}}}
 const declared=researchModelDeclaration(config,'deepseek','m')
 expect(declared).toMatchObject({configuredReasoning:false,configuredMaxOutputTokens:4096,sampling:'not-set-by-evaluator'})
 expect(JSON.stringify(declared)).not.toMatch(/private|secret|baseUrl|apiKey|cost/)
 expect(researchModelDeclaration({},'deepseek','m')).toMatchObject({configuredReasoning:null,configuredMaxOutputTokens:null})
})
it('copies only stage identity fields even when callers pass credential-bearing route objects',()=>{
 const config={providers:{p:{api:'openai-completions',models:[{id:'m',reasoning:false,maxTokens:4096}]}}}
 const route={provider:'p',model:'m',credential:'synthetic-never-persist',baseUrl:'https://private.invalid',headers:{authorization:'synthetic-secret'}}
 const result=researchStageDeclarations(config,route,{check:route,analyze:route,review:route})
 expect(Object.keys(result.review).sort()).toEqual(['declaration','model','provider'])
 expect(JSON.stringify(result)).not.toMatch(/credential|baseUrl|headers|synthetic|private/)
})
it('uses model API precedence and fingerprints inherited compatibility and declared sampling',()=>{
 const config={providers:{p:{api:'openai-completions',compat:{requiresToolResultName:true},models:[{id:'m',api:'anthropic-messages',samplingParams:{temperature:0.2}}]}}}
 const a=researchModelDeclaration(config,'p','m')
 expect(a.configuredApi).toBeNull()
 expect(a.configuredSampling).toEqual({temperature:0.2})
 const b=structuredClone(config);b.providers.p.compat.requiresToolResultName=false
 expect(researchModelDeclaration(b,'p','m').compatibilityFingerprint).not.toBe(a.compatibilityFingerprint)
 const c=structuredClone(config);c.providers.p.models[0]!.samplingParams.temperature=0.8
 expect(researchModelDeclaration(c,'p','m')).not.toEqual(a)
 expect(researchModelDeclaration({providers:{p:{models:[{id:'m',contextWindow:8192}]}}},'p','m').configuredContextWindow).toBe(8192)
 expect(researchModelDeclaration({providers:{p:{models:[{id:'m',contextWindow:128000}]}}},'p','m').configuredContextWindow).toBe(128000)
 const override={providers:{p:{...config.providers.p,models:[{id:'m',compat:{requiresToolResultName:false},samplingParams:{apiKey:'never-copy',temperature:0.2}}]}}}
 const d=researchModelDeclaration(override,'p','m')
 expect(d.configuredApi).toBe('openai-completions')
 expect(d.compatibilityFingerprint).toBe(researchModelDeclaration(b,'p','m').compatibilityFingerprint)
 expect(d.unsupportedSettings).toBe(true)
 expect(JSON.stringify(d)).not.toMatch(/apiKey|never-copy/)
})
it('freezes the actual planned arm order, limits and input identities without claiming fixture enforcement',()=>{
 const input={runId:'run-1',generatedAt:'2026-11-07T00:00:00.000Z',inference:'fixture' as const,provider:'deepseek',model:'m',modelDeclaration:researchModelDeclaration({},'deepseek','m'),tasks:researchTasks().slice(0,2),repeats:2,perArmLimit:3,enforced:false,sourceFingerprint:'source',childBuildFingerprint:'build'}
 const a=researchManifest(input)
 expect(a.version).toBe(2)
 expect(a.execution).toMatchObject({trialSettings:{project:{retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},compaction:{enabled:false},cacheWarming:'off'},agent:{retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},compaction:{enabled:false},cacheWarming:'off'}}})
 expect(a.requestAllocation).toMatchObject({enforced:false,perArmLimit:null,totalLimit:null,multiStageLimits:null})
 expect(a.arms.map(x=>[x.caseId,x.repeat,x.mode])).toEqual([
  ['carbon-missing',1,'single'],['carbon-missing',1,'multi'],['unknown-unit',1,'multi'],['unknown-unit',1,'single'],
  ['carbon-missing',2,'multi'],['carbon-missing',2,'single'],['unknown-unit',2,'single'],['unknown-unit',2,'multi'],
 ])
 expect(a.tasks[0]!.inputHash).not.toBe(a.tasks[1]!.inputHash)
 expect(JSON.stringify(a)).not.toContain('plot-48')
 const capped=researchManifest({...input,inference:'live',enforced:true,perArmLimit:15,tasks:input.tasks.slice(0,1),repeats:1,multiStageLimits:{work:11,review:4}})
 expect(capped.requestAllocation).toMatchObject({enforced:true,totalLimit:30,perArmLimit:15,multiStageLimits:{work:11,review:4}})
 expect(capped.fingerprint).not.toBe(a.fingerprint)
 expect(()=>researchManifest({...input,inference:'live'})).toThrow(/quota|配额/)
 expect(()=>researchManifest({...input,enforced:true,tasks:input.tasks.slice(0,1),repeats:1,perArmLimit:15,multiStageLimits:{work:12,review:4}})).toThrow(/quota|配额/)
})
it('keeps fingerprints reproducible and independent of run timestamp while changing for a changed policy',()=>{
 const input={runId:'a',generatedAt:'a',inference:'fixture' as const,provider:'deepseek',model:'m',modelDeclaration:researchModelDeclaration({},'deepseek','m'),tasks:researchTasks().slice(0,1),repeats:1,perArmLimit:15,enforced:true,sourceFingerprint:'source',childBuildFingerprint:'build'}
 expect(researchManifest(input).fingerprint).toBe(researchManifest({...input,runId:'b',generatedAt:'b'}).fingerprint)
 expect(researchManifest(input).fingerprint).not.toBe(researchManifest({...input,multiStageLimits:{work:11,review:4}}).fingerprint)
})
