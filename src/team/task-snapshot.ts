/** Internal task permission state remains on disk; client snapshots carry only user-facing task facts. */
import type {团队} from './types.js'
import {publicPipeline} from '../protocol/science-pipeline.js'
export function taskTeamSnapshot(team:团队){
 const {pipeline,...rest}=team
 return {...rest,...(pipeline?{pipeline:publicPipeline(pipeline)}:{}),
  members:team.members.map(({taskSettings:_settings,...member})=>member),
  tasks:team.tasks.map(({settings:_settings,...task})=>task),
 }
}
