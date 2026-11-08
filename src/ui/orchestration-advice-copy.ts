import {t,tf} from './i18n/index.js'
import {adviseMode,type AdviceReason,type Mode,type ModeBrief} from '../orchestration/mode-advice.js'
export function modeLabel(mode:Mode){switch(mode){case'single':return t("单任务");case'parallel':return t("并行委派");case'chain':return t("串行交接");case'science':return t("科研流水线")}}
export function adviceReason(reason:AdviceReason){switch(reason){
 case'blocks-required':return t("请说明 1–8 个任务块；更大的任务先分成可验收的阶段。")
 case'dependencies-required':return t("请先说明任务是否依赖前一步的结果。")
 case'independent-review':return t("需要独立审阅，采用已有核查、分析、审阅流水线。")
 case'one-block':return t("一个任务块先单独完成，减少交接。")
 case'shared-writes':return t("任务会写入同一目标，先串行交接以避免竞争。")
 case'ordered-steps':return t("后一步需要前一步结果，按顺序交接。")
 case'independent-blocks':return t("这些任务块彼此独立，可以并行委派。")
 case'review-conflict':return t("独立审阅要求不能由手动选择取消，请选用科研流水线。")
 case'parallel-conflict':return t("存在依赖或共用写入目标，当前不能选用并行委派。")
}}
export function adviceDraft(brief:ModeBrief){
 const advice=adviseMode(brief);if(!advice.valid||!advice.selected)throw new Error('Incomplete or conflicting task brief')
 return [t("任务安排建议"),tf("任务块数：{0}；选用：{1}。",brief.blocks!,modeLabel(advice.selected)),
 brief.dependency==='independent'?t("各任务块互不依赖。"):t("各任务块按前后依赖交接。"),
 brief.sharedWrites?t("存在共用写入目标；沿用产物锁，避免并发写入。"):t("各任务的写入目标分开。"),
 advice.reviewRequired?t("必须保留独立审阅，沿用科研流水线和审阅预留，不能由分析执行者自审替代。"):t("没有额外指定独立审阅；现有契约验收仍然适用。"),
 t("请先明确每块任务的目标、输入、输出和验收判据，再复用已有编排、冻结契约、产物版本和恢复机制执行。"),
 t("这是执行建议，不会自动切换模式；无法满足时请说明原因，不要静默降级。")].join('\n')
}
