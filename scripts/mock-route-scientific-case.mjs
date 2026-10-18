/** Isolated demonstration, driven through the shared inference server.
 * Scheduling is deterministic; every read/write/R process/route update still
 * passes through the real application tools and their existing gates. */
const rScripts = {
  S1: `args <- commandArgs(TRUE)
root <- normalizePath(args[1], mustWork=TRUE)
setwd(root)
d <- read.csv('data/raw/soil_respiration.csv', stringsAsFactors=FALSE)
cat('QC started; 12-second observation pause for the UI demo only.\\n')
Sys.sleep(12)
qc <- data.frame(check=c('row_count','no_missing_cells','unique_plot_id','two_groups','balanced_groups','positive_respiration'), observed=c(nrow(d),sum(is.na(d)),length(unique(d$plot_id)),paste(sort(unique(d$treatment)),collapse='/'),paste(as.integer(table(d$treatment)),collapse='/'),min(d$respiration_umol_m2_s)),passed=c(nrow(d)==32,sum(is.na(d))==0,!anyDuplicated(d$plot_id),identical(sort(unique(d$treatment)),c('control','warming')),all(table(d$treatment)==16),all(d$respiration_umol_m2_s>0)))
write.csv(qc,'results/qc_summary.csv',row.names=FALSE)
writeLines(c('Synthetic soil respiration data: QC',capture.output(print(qc,row.names=FALSE)),'Design statement: independent simulated plots, not a field experiment.'),'results/qc_summary.txt')
stopifnot(all(qc$passed))
cat('S1_OK: QC completed; 32 synthetic independent plots.\\n')
`,
  S2: `args <- commandArgs(TRUE)
setwd(normalizePath(args[1],mustWork=TRUE))
qc <- read.csv('results/qc_summary.csv')
stopifnot(all(qc$passed))
d <- read.csv('data/raw/soil_respiration.csv')
w <- d$respiration_umol_m2_s[d$treatment=='warming']
c <- d$respiration_umol_m2_s[d$treatment=='control']
cat('Welch comparison started; 12-second UI observation pause only.\\n')
Sys.sleep(12)
tt <- t.test(w,c,paired=FALSE,var.equal=FALSE,conf.level=.95)
s <- data.frame(n_control=length(c),n_warming=length(w),mean_control=mean(c),mean_warming=mean(w),sd_control=sd(c),sd_warming=sd(w),mean_difference=mean(w)-mean(c),ci_low=tt$conf.int[1],ci_high=tt$conf.int[2],t=unname(tt$statistic),df=unname(tt$parameter),p_value=tt$p.value)
write.csv(s,'results/welch_summary.csv',row.names=FALSE)
writeLines(c('Synthetic demonstration only; warming minus control.',capture.output(print(s)),'Welch independent two-sample comparison; two-sided alpha=0.05. No covariate adjustment or causal inference.'),'results/welch_summary.txt')
cat('S2_OK: actual Welch calculation completed.\\n')
`,
  S3: `args <- commandArgs(TRUE)
setwd(normalizePath(args[1],mustWork=TRUE))
d <- read.csv('data/raw/soil_respiration.csv')
s <- read.csv('results/welch_summary.csv')
cat('Generating the report and figures; 12-second UI observation pause only.\\n')
Sys.sleep(12)
g <- factor(d$treatment,levels=c('control','warming'))
set.seed(42)
xx <- jitter(as.numeric(g),amount=.08)
draw <- function(){
 par(mar=c(4.5,5,4,1),mgp=c(2.8,.8,0))
 boxplot(d$respiration_umol_m2_s~g,outline=FALSE,ylim=range(d$respiration_umol_m2_s)*c(.95,1.05),col=c('#d7e7e3','#afd4ca'),border='#456b63',ylab='Respiration (umol CO2 m-2 s-1)',xlab='',main='Synthetic soil respiration: two independent groups')
 points(xx,d$respiration_umol_m2_s,pch=21,bg=c('#78948d','#237b68')[as.numeric(g)],col='#33564e',cex=1)
 mtext(sprintf('Welch: difference = %.3f; 95%% CI [%.3f, %.3f]; p = %.4f',s$mean_difference,s$ci_low,s$ci_high,s$p_value),side=3,line=.5,cex=.8)
 mtext('Synthetic demonstration data; not field evidence or a causal effect.',side=1,line=3.1,cex=.75)
}
png('results/figures/soil_respiration.png',width=1200,height=800,res=140);draw();dev.off()
pdf('results/figures/soil_respiration.pdf',width=9,height=6);draw();dev.off()
interpret <- if(s$p_value<.05) '本组合成样本在双侧 0.05 阈值下存在均值差异证据；不构成真实增温效应或因果结论。' else '本组合成样本在双侧 0.05 阈值下证据不足，不能称显著变化，也不能据此证明两组相等。'
report <- c('# 合成土壤呼吸：两组比较演示报告','','所有输入均为模拟数据；本报告仅演示科研分析和路线交付。调度为确定性演示，R 计算真实执行。','','## 数据与方法','32 个独立模拟样地，control / warming 各 16 个；无配对、重复测量、区组或时间层级。','双侧 Welch 独立样本 t 检验，均值差方向为 warming − control，95% t 区间，未校正协变量。单位为 μmol CO₂ m⁻² s⁻¹。','QC 检查行数、缺失、重复编号、分组、组内数量和正值；全部通过后才执行比较。','','## 结果',sprintf('- control：n = %d，均值 %.4f，标准差 %.4f',s$n_control,s$mean_control,s$sd_control),sprintf('- warming：n = %d，均值 %.4f，标准差 %.4f',s$n_warming,s$mean_warming,s$sd_warming),sprintf('- 均值差 %.6f；95%% CI [%.6f, %.6f]；t = %.6f，df = %.4f，p = %.6f',s$mean_difference,s$ci_low,s$ci_high,s$t,s$df,s$p_value),interpret,'','## 查看与复现','本步产物里可分别打开 PNG、PDF 和本报告；统计表位于 S2，QC 表位于 S1。','输入生成种子 2026101802；图中横向抖动种子 42，PNG/PDF 共用相同抖动坐标。','三个脚本每次含 12 秒演示停留，仅用于观察界面状态，与科研算法或运行耗时估计无关。','脚本：analysis/01_qc.R、analysis/02_welch.R、analysis/03_report.R。','尚未独立科学审查，不应将工具成功或文件交付当作科学结论验证完成。')
writeLines(enc2utf8(report),'results/report_zh.md',useBytes=TRUE)
cat('S3_OK: Markdown, PNG and PDF generated from actual outputs.\\n')
`,
}
const scriptPaths={S1:'analysis/01_qc.R',S2:'analysis/02_welch.R',S3:'analysis/03_report.R'}
const outputPaths={S1:['results/qc_summary.csv','results/qc_summary.txt'],S2:['results/welch_summary.csv','results/welch_summary.txt'],S3:['results/report_zh.md','results/figures/soil_respiration.png','results/figures/soil_respiration.pdf']}
const txt=value=>typeof value==='string'?value:Array.isArray(value)?value.map(v=>v.text??'').join('\n'):''
const parse=value=>{try{return JSON.parse(txt(value).replace(/^\s*\[[^\]\n]+\]\s*/,''))}catch{return undefined}}
const withoutVersion=route=>{const {routeId,revision,updatedAt,...draft}=structuredClone(route);return draft}
function context(body){
 if(!(body.tools??[]).some(tool=>(tool.function?.name??tool.name)==='get_analysis_route'))return
 const messages=body.messages??[];const index=messages.findLastIndex(m=>m.role==='user');if(index<0)return
 const user=txt(messages[index].content);let action
 if(user.startsWith('[analysis_route_action] ')){try{action=JSON.parse(user.split('\n')[0].slice('[analysis_route_action] '.length))}catch{}}
 if(!user.includes('土壤呼吸路线演示')&&!action)return
 const names=new Map(messages.flatMap(m=>(m.tool_calls??[]).map(c=>[c.id,c.function?.name])))
 const results=messages.slice(index+1).filter(m=>m.role==='tool').map(m=>({id:m.tool_call_id,name:m.name??names.get(m.tool_call_id),data:parse(m.content),raw:txt(m.content)}))
 const current=results.findLast(r=>r.name==='update_analysis_route'&&r.data?.routeId)?.data??results.findLast(r=>r.name==='get_analysis_route')?.data?.route
 return {action,results,current}
}
function draft(){return {title:'合成土壤呼吸 · 三步科研路线',goal:'核查32个独立模拟样地，做Welch两组比较并交付图表报告；非真实增温效应验证',dataContext:['合成数据，种子2026101802','control/warming各16个独立样地；无配对、重复测量、区组','确定性演示调度＋真实R执行；每步仅在点击后继续'],steps:['输入核查','Welch 两组比较','图表与中文报告'].map((title,i)=>({id:'S'+(i+1),title,purpose:['核对样本、缺失与分组，并保留QC结果','先确认报告呈现格式，再运行独立两组均值比较','读取已有统计表，输出中文简报和可查看的PNG/PDF'][i],inputs:i===0?['data/raw/soil_respiration.csv','data/raw/README.md']:i===1?['data/raw/soil_respiration.csv','results/qc_summary.csv']:['data/raw/soil_respiration.csv','results/welch_summary.csv'],outputs:outputPaths['S'+(i+1)],dependencies:i?['S'+i]:[],status:'pending',blockers:[],cases:[],deliverables:[],execution:{state:'not_run',note:'尚未运行本步R代码'},verification:{state:'unreviewed',note:'尚未独立科学审查'},needsReview:false,notes:[]}))}}
export function scientificRouteDemo(){return {
 toolCall(body){
  const ctx=context(body);if(!ctx)return
  const {action,results,current}=ctx
  if(!results.length)return {toolName:'get_analysis_route',args:{},say:'读取本会话路线；本轮是确定性演示调度，R与文件工具真实执行。'}
  if(!action){
   if(!results.some(r=>r.name==='read'))return {toolName:'read',args:{path:'data/raw/README.md'},say:'先读取这份合成数据的研究设计说明。'}
   if(!current&&!results.some(r=>r.name==='update_analysis_route'))return {toolName:'update_analysis_route',args:{expectedRevision:0,route:draft()},say:'建立三步路线，逐步等待点击继续。'}
   return
  }
  if(action.action!=='continue'||!current)return
  const id=action.stepId;if(!rScripts[id])return
  if(id==='S2'){
   const question=results.find(r=>r.name==='ask_user_question')
   if(!question)return {toolName:'ask_user_question',args:{questions:[{id:'report_style',header:'演示确认 · 呈现格式',question:'这次演示结果采用哪种呈现格式？此项仅确认格式，不替代科研执行授权。',options:[{label:'中文简报',description:'保留样本量、均值差、95%区间与p值，并写明合成数据边界。'},{label:'先暂停',description:'停在确认阶段，不执行本步统计；之后可重新点击继续。'}]}]},say:'在S2停下来确认演示报告格式；请在主对话回答。'}
   if(!question.data?.answers?.find(answer=>answer.id==='report_style')?.selected?.includes('中文简报'))return
  }
  if(!results.some(r=>r.name==='write'))return {toolName:'write',args:{path:scriptPaths[id],content:rScripts[id]},say:'交付本步可复现R脚本，接着只运行这一步。'}
  const updates=results.filter(r=>r.name==='update_analysis_route'&&r.data?.routeId)
  if(!updates.length){const next=withoutVersion(current);next.steps.find(s=>s.id===id).status='in_progress';return {toolName:'update_analysis_route',args:{expectedRevision:current.revision,route:next},say:'记录本步进入处理阶段；尚未声称科研计算完成。'}}
  const run=results.find(r=>r.name==='bash')
  if(!run)return {toolName:'bash',args:{command:`/Library/Frameworks/R.framework/Resources/bin/Rscript --vanilla ${scriptPaths[id]} . > results/${id}-run.log 2>&1; result=$?; cat results/${id}-run.log; exit "$result"`},say:'现在真实调用R。12秒停留仅用于看清界面状态，不作为计算耗时指标。'}
  if(!run.raw.includes(id+'_OK'))return
  if(updates.length<2){const next=withoutVersion(current);const step=next.steps.find(s=>s.id===id);step.status='delivered';step.execution={state:'completed',note:'实际R进程成功返回；生成的结果仍需独立复核。12秒停留仅为界面演示。',toolCallIds:[run.id]};step.deliverables=[scriptPaths[id],...outputPaths[id],`results/${id}-run.log`].map(path=>({path}));return {toolName:'update_analysis_route',args:{expectedRevision:current.revision,route:next},say:'按实际R返回结果登记本步交付，保留未独立科学审查的边界。'}}
  if(!results.some(r=>r.name==='read'))return {toolName:'read',args:{path:outputPaths[id][0]},say:'读取实际产物，供界面展示。'}
 },
 reply(body){const ctx=context(body);if(!ctx)return;if(!ctx.action)return '三步路线已建立。请逐步点击继续；每步都由实际工具执行，未选步骤不会自动运行。';const id=ctx.action.stepId;const run=ctx.results.find(r=>r.name==='bash');const done=ctx.current?.steps.find(s=>s.id===id)?.status==='delivered';return done?`${id} 已由实际R进程运行并登记交付。可在路线里打开本步产物。调度为确定性演示，未进行独立科学审查。`:run?`${id} 未成功交付，请检查真实工具输出；不会伪造成功。`:'本步停在确认或执行前，请核对主对话与实际工具记录。'}
}}
