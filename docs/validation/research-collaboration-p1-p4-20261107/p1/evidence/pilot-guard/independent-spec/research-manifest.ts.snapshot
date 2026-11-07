/** Frozen, credential-free identity for a representative research experiment. */
import {researchFingerprint,type ResearchTask} from './research-tasks.js'
const object=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0
/** Only explicit declarations are reported; an absent setting is not an inferred SDK default. */
export function researchModelDeclaration(config:unknown,provider:string,model:string){
 const p=object(object(object(config)?.providers)?.[provider]),models=p?.models
 const row=Array.isArray(models)?models.map(object).find(r=>r?.id===model):undefined
 // Match Pi's model override precedence. Only known scalar request settings may leave RAM.
 const compatibility={...object(p?.compat),...object(row?.compat)},safeCompatibility:Record<string,boolean|string|number>={}
 const booleans=['supportsStore','supportsDeveloperRole','supportsReasoningEffort','supportsUsageInStreaming','supportsFinishReason','requiresToolResultName','requiresAssistantAfterToolResult','requiresThinkingAsText','requiresReasoningContentOnAssistantMessages','zaiToolStream','supportsThinkingTokenBudget','supportsOpenAIGrammarTools','supportsMidConvoSystemMessages','supportsMidConvoToolAdditions','supportsStrictMode','sendSessionAffinityHeaders','supportsLongCacheRetention']
 for(const key of booleans)if(typeof compatibility[key]==='boolean')safeCompatibility[key]=compatibility[key]
 const enums:Record<string,string[]>={maxTokensField:['max_tokens','max_completion_tokens'],thinkingFormat:['openai','openrouter','deepseek','together','baseten','zai','qwen','chat-template','qwen-chat-template','string-thinking','ant-ling'],thinkingTokenBudgetField:['thinking_token_budget','thinking_budget','thinking_budget_tokens'],cacheControlFormat:['anthropic'],sessionAffinityFormat:['openai','openai-nosession','openrouter']}
 for(const [key,values] of Object.entries(enums))if(typeof compatibility[key]==='string'&&values.includes(compatibility[key]))safeCompatibility[key]=compatibility[key]
 if(typeof compatibility.vllmPriority==='number'&&Number.isFinite(compatibility.vllmPriority))safeCompatibility.vllmPriority=compatibility.vllmPriority
 const sampling=object(row?.samplingParams),configuredSampling:Record<string,number>={}
 for(const key of ['temperature','top_p','top_k','min_p','repetition_penalty','frequency_penalty','presence_penalty','seed'])if(typeof sampling?.[key]==='number'&&Number.isFinite(sampling[key]))configuredSampling[key]=sampling[key]
 // Unrepresented/custom settings cannot silently participate in a live comparison.
 const unsupportedSettings=Object.keys(compatibility).some(k=>!Object.hasOwn(safeCompatibility,k))||row?.samplingParams!==undefined&&(!sampling||Object.keys(sampling).some(k=>!Object.hasOwn(configuredSampling,k)))||!!p?.modelOverrides
 const api=row?.api??p?.api
 return{configuredReasoning:typeof row?.reasoning==='boolean'?row.reasoning:null,configuredMaxOutputTokens:positive(row?.maxTokens)?row.maxTokens:null,configuredContextWindow:positive(row?.contextWindow)?row.contextWindow:null,
  configuredInput:Array.isArray(row?.input)?row.input.filter((v):v is string=>v==='text'||v==='image'):null,
  configuredApi:api==='openai-completions'?'openai-completions':null,
  compatibilityFingerprint:Object.keys(safeCompatibility).length?researchFingerprint(safeCompatibility):null,
  configuredSampling:sampling?configuredSampling:null,unsupportedSettings,
  sampling:'not-set-by-evaluator' as const}
}
export type ResearchModelDeclaration=ReturnType<typeof researchModelDeclaration>
export type ResearchStageModels=Record<'check'|'analyze'|'review',{provider:string;model:string}>
export type ResearchStageDeclarations=Record<'check'|'analyze'|'review',{provider:string;model:string;declaration:ResearchModelDeclaration}>
/** Applied only inside retained evaluation trials; all attempted requests still count. */
export function researchTrialSettings(){
 return{retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},compaction:{enabled:false},cacheWarming:'off' as const}
}
/** Compare private connection fields in memory; only safe stage identities enter the manifest. */
export function researchStageDeclarations(config:unknown,primary:{provider:string;model:string},stages:ResearchStageModels):ResearchStageDeclarations{
 const providers=object(object(config)?.providers)
 const privateConnection=(provider:string,model:string)=>{
  const p=object(providers?.[provider]),rows=p?.models,row=Array.isArray(rows)?rows.map(object).find(r=>r?.id===model):undefined
  if(!p||!row)throw new Error('阶段模型配置缺失')
  return researchFingerprint([row.baseUrl??p.baseUrl,p.apiKey,p.headers,p.authHeader])
 }
 const primaryDeclaration=researchModelDeclaration(config,primary.provider,primary.model),connection=privateConnection(primary.provider,primary.model)
 return Object.fromEntries((['check','analyze','review'] as const).map(stage=>{
  const route=stages[stage],declaration=researchModelDeclaration(config,route.provider,route.model)
  if(route.model!==primary.model||researchFingerprint(declaration)!==researchFingerprint(primaryDeclaration)||privateConnection(route.provider,route.model)!==connection)throw new Error('阶段模型配置与主模型不一致')
  return[stage,{provider:route.provider,model:route.model,declaration}]
 })) as ResearchStageDeclarations
}
export interface ResearchManifestInput {
 runId:string;generatedAt:string;inference:'fixture'|'live';provider:string;model:string;modelDeclaration:ResearchModelDeclaration
 tasks:readonly ResearchTask[];repeats:number;perArmLimit:number;enforced:boolean;multiStageLimits?:{work:number;review:number};stageModels?:ResearchStageDeclarations
 sourceFingerprint:string;childBuildFingerprint:string
}
export function researchManifest(input:ResearchManifestInput){
 const {runId,generatedAt,inference,provider,model,modelDeclaration,repeats,perArmLimit,enforced,sourceFingerprint,childBuildFingerprint}=input
 if(!input.tasks.length||new Set(input.tasks.map(t=>t.id)).size!==input.tasks.length||!positive(repeats)||repeats>4)throw new Error('Invalid research task allocation')
 if(inference==='live'&&!enforced||!positive(perArmLimit)||enforced&&perArmLimit*input.tasks.length*2*repeats>30)throw new Error('Invalid research quota allocation')
 if(input.multiStageLimits&&(!enforced||!positive(input.multiStageLimits.work)||!positive(input.multiStageLimits.review)||input.multiStageLimits.work+input.multiStageLimits.review!==perArmLimit))throw new Error('Invalid stage quota allocation')
 const tasks=input.tasks.map(t=>({caseId:t.id,inputHash:researchFingerprint(t.csv),taskFingerprint:researchFingerprint(t),expectedOutcome:t.expected?'accepted' as const:'blocked' as const}))
 const requestAllocation={enforced,perArmLimit:enforced?perArmLimit:null,totalLimit:enforced?30:null,multiStageLimits:input.multiStageLimits?{...input.multiStageLimits}:null}
 const arms:{caseId:string;repeat:number;mode:'single'|'multi'}[]=[]
 for(let repeat=1;repeat<=repeats;repeat++)for(const [index,t] of input.tasks.entries())for(const mode of ((index+repeat-1)%2?['multi','single']:['single','multi']) as ('single'|'multi')[])arms.push({caseId:t.id,repeat,mode})
 const stable={inference,provider,model,modelDeclaration:structuredClone(modelDeclaration),tasks,repeats,requestAllocation,sourceFingerprint,childBuildFingerprint,
  execution:{tools:['read','write','bash'],permissionTier:'allow-all',maxRevisions:0,trialSettings:{project:researchTrialSettings(),agent:researchTrialSettings()}},stageModels:input.stageModels?structuredClone(input.stageModels):null,arms}
 return{version:2 as const,runId,generatedAt,fingerprint:researchFingerprint(stable),...stable}
}
