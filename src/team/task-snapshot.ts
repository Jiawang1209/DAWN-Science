/** Internal task permission state remains on disk; client snapshots carry only user-facing task facts. */
import type {团队} from './types.js'
export function taskTeamSnapshot(team:团队){
 return {...team,
  members:team.members.map(({taskSettings:_settings,...member})=>member),
  tasks:team.tasks.map(({settings:_settings,...task})=>task),
 }
}
