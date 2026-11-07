/** Request-dialect pin for the currently authorized DeepSeek pilot, including loopback aliases. */
import type {Api,Model} from '@earendil-works/pi-ai'

export function researchProxyModel(model:Model<Api>){
 if(model.provider!=='deepseek'||model.api!=='openai-completions'||!model.compat)throw new Error('Pilot compatibility has only been verified for DeepSeek completions')
 return {compat:model.compat,id:model.id,name:model.id,input:['text'],reasoning:false,contextWindow:model.contextWindow,maxTokens:4096,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}
}
