/** Internal task permission state remains on disk; client snapshots carry only user-facing task facts. */
import {publicTaskTrace} from '../protocol/task-trace.js'
import type {团队} from './types.js'
import {publicScienceBatch} from '../protocol/science-batch.js'
import {publicPipeline} from '../protocol/science-pipeline.js'
export function taskTeamSnapshot(team:团队){
 const {pipeline,scienceBatch,...rest}=team
 return {...rest,...(scienceBatch?{scienceBatch:publicScienceBatch(scienceBatch,pipeline)}:{}),...(pipeline?{pipeline:publicPipeline(pipeline)}:{}),
  members:team.members.map(({taskSettings:_settings,frozenAgentDefinition:_definition,...member})=>member),
  tasks:team.tasks.map(({settings:_settings,trace,...task})=>({...task,...(trace?{trace:publicTaskTrace(trace)}:{})})),
 }
}
