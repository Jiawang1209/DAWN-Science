import { computed } from 'nanostores'
import type { TranscriptItem } from '../../protocol/index.js'
import { parseRouteActionMessage } from '../../protocol/analysis-route.js'
import { $items } from './transcript.js'

/** Only return a stable marker string: streaming bytes must not rerender the shell.
 * A native model can start a tool without first writing an agent message. */
export function routeTurnMarker(items:readonly TranscriptItem[]):string|undefined {
  const index=items.findLastIndex(item=>item.type==='turn'&&item.who==='user')
  const user=items[index]
  if(user?.type!=='turn'||parseRouteActionMessage(user.text)?.action!=='continue')return undefined
  const running=items.slice(index+1).some(item=>(item.type==='turn'&&item.who==='agent'&&!item.final)||(item.type==='tool'&&item.status==='running')||(item.type==='question'&&item.state==='pending'))
  return running?user.text.split('\n',1)[0]:undefined
}
export const $routeTurnMarker=computed($items,routeTurnMarker)
