import {computed} from 'nanostores'
import {主槽} from './transcript.js'
import {侧槽} from './side-chat.js'
export const $mainArrangementPlan=computed(主槽.$items,items=>items.findLast(item=>item.type==='plan'))
export const $sideArrangementPlan=computed(侧槽.$items,items=>items.findLast(item=>item.type==='plan'))

export const $mainArrangementPlanning=computed(主槽.$会话开关,options=>options?.some(o=>o.id==='dawn.plan'&&o.current==='1')??false)
export const $sideArrangementPlanning=computed(侧槽.$会话开关,options=>options?.some(o=>o.id==='dawn.plan'&&o.current==='1')??false)

const finalReply=(items:readonly import('../../protocol/index.js').TranscriptItem[])=>items.findLast(i=>i.type==='turn'&&i.who==='agent'&&i.final||i.type==='notice'&&i.failed)?.id
export const $mainArrangementReply=computed(主槽.$items,finalReply)
export const $sideArrangementReply=computed(侧槽.$items,finalReply)
