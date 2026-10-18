import { describe,expect,it } from 'vitest'
import { validateRouteEvidence, collectRouteToolEvidence, type RouteToolEvidence } from '../../src/runtime/analysis-route-evidence.js'
import type { AnalysisRouteDraft, AnalysisRoute } from '../../src/protocol/analysis-route.js'
const draft=():AnalysisRouteDraft=>({title:'r',goal:'g',dataContext:[],steps:[{id:'S',title:'S',purpose:'p',inputs:[],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[{server:'A',caseId:'full/id',title:'Real',coverage:'c',evidence:'metadata'}],deliverables:[],execution:{state:'not_run',note:'n'},verification:{state:'unreviewed',note:'n'},needsReview:false,notes:[]}]})
const tool=(name='A__search_cases',result='[{"case_id":"full/id","title":"Real"}]'):RouteToolEvidence=>({toolCallId:'t1',name,status:'done',result})
describe('route evidence boundary',()=>{
 it('matches complete case identities per server, rejects renamed candidates and fake content inspection',()=>{
  expect(()=>validateRouteEvidence(draft(),undefined,[tool()],'' )).not.toThrow()
  expect(()=>validateRouteEvidence(draft(),undefined,[tool('B__search_cases')],'' )).toThrow(/案例/)
  const d=draft();d.steps[0]!.cases[0]!.title='Invented';expect(()=>validateRouteEvidence(d,undefined,[tool()],'' )).toThrow(/案例/)
  d.steps[0]!.cases[0]!.title='Real';d.steps[0]!.cases[0]!.evidence='content_checked';expect(()=>validateRouteEvidence(d,undefined,[tool()],'' )).toThrow(/正文/)
  expect(()=>validateRouteEvidence(d,undefined,[tool('A__get_case','{"case_id":"full/id","title":"Real","code":"x=1"}')],'' )).not.toThrow()
 })
 it('keeps saved candidates through context compression but does not invent a selection',()=>{
  const previous={...draft(),routeId:'r',revision:1,updatedAt:1} as AnalysisRoute
  expect(()=>validateRouteEvidence(draft(),previous,[],'' )).not.toThrow()
  const d=draft();d.steps[0]!.selectedCase={server:'A',caseId:'full/id'}
  expect(()=>validateRouteEvidence(d,previous,[],'' )).toThrow(/选择/)
  expect(()=>validateRouteEvidence(d,previous,[],'请选择 full/id 作为参考案例')).not.toThrow()
  expect(()=>validateRouteEvidence(d,previous,[],'说明 full/id 的用途')).toThrow(/选择/)
 })
 it('requires actual scientific execution/review results, not reads or metadata calls',()=>{
  const d=draft();d.steps[0]!.cases=[];d.steps[0]!.execution={state:'completed',note:'ran',toolCallIds:['t1']}
  for(const name of ['read','write','get_analysis_route','update_analysis_route'])expect(()=>validateRouteEvidence(d,undefined,[tool(name,'ok')],'' )).toThrow(/执行/)
  expect(()=>validateRouteEvidence(d,undefined,[{...tool('run_code','ok'),execution:'ran'}],'' )).not.toThrow()
  expect(()=>validateRouteEvidence(d,undefined,[{...tool('run_code','error'),status:'error'}],'' )).toThrow(/执行/)
  d.steps[0]!.execution.state='failed';expect(()=>validateRouteEvidence(d,undefined,[{...tool('run_code','拒绝'),status:'error',execution:'not_observed'}],'' )).toThrow(/执行/)
 })
})

describe('selection scope',()=>{
 it('requires a uniquely identified step when one case occurs in multiple steps',()=>{
  const d=draft();d.steps.push({...structuredClone(d.steps[0]!),id:'S2'});const previous={...structuredClone(d),routeId:'r',revision:1,updatedAt:1} as AnalysisRoute
  d.steps[0]!.selectedCase={server:'A',caseId:'full/id'}
  expect(()=>validateRouteEvidence(d,previous,[],'请选择 full/id 作为参考案例')).toThrow(/步骤/)
  expect(()=>validateRouteEvidence(d,previous,[],'S 请选择 full/id 作为参考案例')).not.toThrow()
  expect(()=>validateRouteEvidence(d,previous,[],'S 请选择 full/id-long 作为参考案例')).toThrow(/选择/)
 })
})

describe('evidence attribution and explicit selection',()=>{
 it('refuses another step evidence and metadata-only case shells',()=>{
  const d=draft();d.steps[0]!.execution={state:'completed',note:'ran',toolCallIds:['t1']}
  expect(()=>validateRouteEvidence(d,undefined,[{...tool('run_code','ok'),execution:'ran',stepId:'other'},{...tool(),toolCallId:'case-tool'}],'' )).toThrow(/执行/)
  d.steps[0]!.execution={state:'not_run',note:'n'};d.steps[0]!.cases[0]!.evidence='content_checked'
  expect(()=>validateRouteEvidence(d,undefined,[tool('A__get_case','{"case_id":"full/id","title":"Real","files":["analysis.R"]}')],'' )).toThrow(/正文/)
 })
 it('does not treat a question, negative request or title mention as choosing a case',()=>{
  const d=draft();const previous={...structuredClone(d),routeId:'r',revision:1,updatedAt:1} as AnalysisRoute;d.steps[0]!.selectedCase={server:'A',caseId:'full/id'}
  for(const user of ['不要选择 full/id','full/id 是否值得参考？','请说明 full/id 的参考价值','> 请选择 full/id'])expect(()=>validateRouteEvidence(d,previous,[],user)).toThrow(/选择/)
 })
})


describe('duplicate result identity recovery',()=>{
 it('clears execution facts from an earlier result when the same id later has only a denied result',()=>{
  const branch=[
   {type:'message',message:{role:'toolResult',toolCallId:'same',toolName:'bash',content:[{type:'text',text:'ok'}],details:{analysisRouteEvidence:{execution:'ran',stepId:'S',filesWritten:['out.txt']}}}},
   {type:'message',message:{role:'toolResult',toolCallId:'same',toolName:'bash',isError:true,content:[{type:'text',text:'denied'}]}},
  ]
  const recovered=collectRouteToolEvidence(branch)
  expect(recovered[0]!.execution).toBe('not_observed')
  expect(recovered[0]!.filesWritten).toBeUndefined()
 })
})


describe('case content identity boundary',()=>{
 it('does not borrow a related case body to mark the parent case checked',()=>{
  const d=draft();d.steps[0]!.cases[0]!.evidence='content_checked'
  const result='{"case_id":"full/id","title":"Real","related_cases":[{"case_id":"other/id","title":"Other","code":"only other code"}]}'
  expect(()=>validateRouteEvidence(d,undefined,[tool('A__get_case',result)],'')).toThrow(/正文/)
  d.steps[0]!.cases=[{server:'A',caseId:'other/id',title:'Other',coverage:'c',evidence:'content_checked'}]
  expect(()=>validateRouteEvidence(d,undefined,[tool('A__get_case',result)],'')).not.toThrow()
 })
})
