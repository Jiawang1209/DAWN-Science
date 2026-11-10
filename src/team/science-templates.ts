/** Host recipe expansion; no inferred scientific methods. */
import {ScienceAcceptanceSchema} from '../protocol/science-acceptance.js'
import {ScienceTemplateSchema,type ScienceTemplate} from '../protocol/science-template.js'
export {ScienceTemplateSchema,type ScienceTemplate} from '../protocol/science-template.js'
export function scienceTemplate(template:ScienceTemplate,root:string,inputs:readonly string[],dataPath?:string){
 const t=ScienceTemplateSchema.parse(template),script=`${root}/analysis.${t.language==='r'?'R':'py'}`
 if(t.id==='figure-reproduction'&&!inputs.includes(t.evidencePath))throw new Error('图表模板必须声明已有文献证据文件作为输入；请先完成证据提取')
 if(t.id==='tabular-ecology'&&t.validation&&(!dataPath||!inputs.includes(dataPath)))throw new Error('每项须给出已声明输入中的 dataPath，才能进行数值核验')
 const outputs=[script,`${root}/${t.id==='tabular-ecology'?'result.json':'figure.svg'}`,`${root}/report.md`]
 const instructions=[`科研模板 ${t.id}@${t.version}；语言 ${t.language}；用户已批准方法：${t.method}。`,t.id==='tabular-ecology'?`${t.unitStatus==='missing'?'数据单位尚未提供：当前仅补信息，不得执行计算或写科研产物，包括status=blocked的占位result.json。':'单位规则：'+t.units+'。'}缺失值规则：${t.missingValues}。`:`证据文件 ${t.evidencePath}；出处 ${t.citation}；页码 ${t.page}；目标图 ${t.targetFigure}；允许变换 ${t.transformations}。只读 PDF 或路径存在不能证明理解了文献。`,'核查输入结构、方法适用条件及证据缺口；条件不足须 blockers，不猜测单位、填补缺失或编造数据。','需要受控环境复用时，Python 使用 python3 -I 声明脚本路径 的单一命令；宿主绕过 shell 启动隔离解释器，等待非守护线程与退出回调收尾。该同步模式禁止创建子进程；本地代码/数据须列入 inputs，未声明文件或外部依赖不签发复用证明。需要子进程时交还主会话选择普通执行，不能自动改命令重试。R 沿用普通执行与验收，暂不签发依赖及生命周期未完整核实的复用证明。', '按约定方法执行并保留可复现脚本；报告须列输入、处理、结果及局限。独立审阅核查实际文件及方法一致性。输出：'+outputs.join('、')].join('\n')
 const acceptance=ScienceAcceptanceSchema.parse({version:1,kind:t.id,...(t.id==='tabular-ecology'&&t.unitStatus==='missing'?{unitStatus:'missing'}:{}),scriptPath:script,reportPath:outputs[2],resultPath:outputs[1],...(t.id==='tabular-ecology'&&t.validation?{numeric:{...t.validation,dataPath}}:{}),...(t.id==='figure-reproduction'?{evidencePath:t.evidencePath,citation:t.citation,page:t.page,targetFigure:t.targetFigure}:{})})
 return{outputs,instructions:instructions+'\n宿主验收规则：'+JSON.stringify(acceptance)+(t.id==='tabular-ecology'?'；result.json 使用平铺对象 {n:正整数,unit:单位字符串,指标名:有限数值}，须与正式 data.metrics 和 sampleCount 一致。':'；SVG须为静态图，报告须保留指定出处、页码与目标图。'),acceptance}
}
