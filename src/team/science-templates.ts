/** Host recipe expansion; no inferred scientific methods. */
import {ScienceTemplateSchema,type ScienceTemplate} from '../protocol/science-template.js'
export {ScienceTemplateSchema,type ScienceTemplate} from '../protocol/science-template.js'
export function scienceTemplate(template:ScienceTemplate,root:string,inputs:readonly string[]){
 const t=ScienceTemplateSchema.parse(template),script=`${root}/analysis.${t.language==='r'?'R':'py'}`
 if(t.id==='figure-reproduction'&&!inputs.includes(t.evidencePath))throw new Error('图表模板必须声明已有文献证据文件作为输入；请先完成证据提取')
 const outputs=[script,`${root}/${t.id==='tabular-ecology'?'result.json':'figure.svg'}`,`${root}/report.md`]
 const instructions=[`科研模板 ${t.id}@${t.version}；语言 ${t.language}；用户已批准方法：${t.method}。`,t.id==='tabular-ecology'?`单位规则：${t.units}。缺失值规则：${t.missingValues}。`:`证据文件 ${t.evidencePath}；出处 ${t.citation}；页码 ${t.page}；目标图 ${t.targetFigure}；允许变换 ${t.transformations}。只读 PDF 或路径存在不能证明理解了文献。`,'核查输入结构、方法适用条件及证据缺口；条件不足须 blockers，不猜测单位、填补缺失或编造数据。','按约定方法执行并保留可复现脚本；报告须列输入、处理、结果及局限。独立审阅核查实际文件及方法一致性。输出：'+outputs.join('、')].join('\n')
 return{outputs,instructions}
}
