/** Shared engineering acceptance fixture. Inference is deterministic; Python, files and comparisons are real. */
const text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(x=>x?.text??'').join('\n'):''
export const deliveryDemoData='plot_id,soil_moisture_pct,biomass_g_m2\n'+Array.from({length:30},(_,i)=>`${i+1},${10+i*.5},${[5,22].includes(i)?-999:(3*(10+i*.5)+12+[-3,1,2,-1,0][i%5]).toFixed(2)}`).join('\n')+'\n'
export const deliveryDemoScript=`# DAWN_DELIVERY_FIXTURE: synthetic scientific delivery acceptance; workspace and output are explicit argv.
import csv, json, pathlib, sys, struct, zlib, math
if len(sys.argv) != 3:
    raise SystemExit('Usage: python run_analysis.py <workspace> <output>')
root, out = map(pathlib.Path, sys.argv[1:])
out.mkdir(parents=True, exist_ok=True)
with (root/'data/raw/grassland.csv').open(newline='') as f:
    raw = list(csv.DictReader(f))
rows = [r for r in raw if float(r['biomass_g_m2']) != -999]
x = [float(r['soil_moisture_pct']) for r in rows]
y = [float(r['biomass_g_m2']) for r in rows]
n = len(rows)
mx, my = sum(x)/n, sum(y)/n
slope = sum((a-mx)*(b-my) for a,b in zip(x,y))/sum((a-mx)**2 for a in x)
intercept = my-slope*mx
r2 = 1-sum((b-(intercept+slope*a))**2 for a,b in zip(x,y))/sum((b-my)**2 for b in y)
summary = dict(n_total=len(raw), n_effective=n, n_excluded=len(raw)-n, slope=round(slope,8), intercept=round(intercept,8), r2=round(r2,8))
with (out/'model.csv').open('w',newline='') as f:
    writer=csv.DictWriter(f, fieldnames=list(summary));writer.writeheader();writer.writerow(summary)
(out/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
(out/'analysis_report.md').write_text('# Synthetic grassland analysis\\n\\nInput: data/raw/grassland.csv. Missing code -999 excluded in biomass.\\n\\n'+json.dumps(summary)+'\\n\\nOLS association only; no p value or CI computed; synthetic demonstration, not a field estimate.',encoding='utf-8')
w,h=640,380
pixels=bytearray([250,252,251])*(w*h)
def dot(px,py,color,r=2):
    for yy in range(max(0,int(py)-r),min(h,int(py)+r+1)):
        for xx in range(max(0,int(px)-r),min(w,int(px)+r+1)):
            off=(yy*w+xx)*3;pixels[off:off+3]=bytes(color)
def point(a,b): return (55+(a-min(x))/(max(x)-min(x))*540,320-(b-min(y)+5)/(max(y)-min(y)+10)*270)
for a in range(55,596):dot(a,320,(110,125,119),0)
for b in range(40,321):dot(55,b,(110,125,119),0)
for a,b in zip(x,y):dot(*point(a,b),(39,135,118),4)
for k in range(541):
    a=min(x)+(max(x)-min(x))*k/540;dot(*point(a,intercept+slope*a),(42,70,104),1)
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\\x00'+pixels[i*w*3:(i+1)*w*3] for i in range(h))))+chunk(b'IEND',b'')
(out/'regression.png').write_bytes(png)
print('ACTUAL_SCIENCE_OUTPUT='+json.dumps(summary))
`
function context(body){const messages=body.messages??[],index=messages.findLastIndex(m=>m.role==='user');if(index<0||!text(messages[index].content).includes('演示科研分析交付'))return;const calls=messages.slice(index+1).flatMap(m=>m.tool_calls??[]);return {calls}}
export function deliveryDemoTool(body){const c=context(body);if(!c)return;const names=(body.tools??[]).map(t=>t.function?.name??t.name);if(!names.includes('write')||!names.includes('bash'))return;const writes=c.calls.filter(c=>c.function?.name==='write').length;if(writes===0)return {toolName:'write',args:{path:'data/raw/grassland.csv',content:deliveryDemoData},say:'建立合成草地数据；30 条观测，2 条缺失编码 -999。'};if(writes===1)return {toolName:'write',args:{path:'analysis/run_analysis.py',content:deliveryDemoScript},say:'保存有明确输入与输出参数的 Python 分析脚本。'};if(!c.calls.some(c=>c.function?.name==='bash'))return {toolName:'bash',args:{command:'/usr/bin/python3 analysis/run_analysis.py . results',timeout:30},say:'真实运行合成数据回归，生成统计表、报告和 PNG。'}}
export function deliveryDemoReply(body){if(context(body))return '合成草地分析案例已运行。请在产物中选择 analysis/run_analysis.py、results/model.csv、results/summary.json、results/analysis_report.md 与 results/regression.png，输入引用为 data/raw/grassland.csv，再整理交付。计算结果以实际文件为准；本案例的模型回复为确定性工程夹具，不证明真实模型的科研解读质量。'}
export function analysisDeliveryMockReply(body){
 const system=text(body.system)||text(body.messages?.find(m=>m.role==='system'||m.role==='developer')?.content)
 if(!system.includes('DAWN_ANALYSIS_DELIVERY_V1'))return
 const user=text([...(body.messages??[])].reverse().find(m=>m.role==='user')?.content)
 let input;try{input=JSON.parse(user)}catch{return JSON.stringify({error:'fixture missing evidence'})}
 const script=input.evidence?.find(e=>e.path.endsWith('.py')&&e.text?.includes('DAWN_DELIVERY_FIXTURE'))
 const summaryFile=input.evidence?.find(e=>e.path.endsWith('summary.json')&&e.text)
 const table=input.evidence?.find(e=>e.path.endsWith('model.csv')&&e.text)
 let summary;try{summary=summaryFile?JSON.parse(summaryFile.text):undefined}catch{}
 const details=summary?`有效样本 ${summary.n_effective} / ${summary.n_total}，排除 ${summary.n_excluded} 条生物量缺失编码 -999；OLS 斜率 ${summary.slope}，截距 ${summary.intercept}，R² ${summary.r2}。`:'当前选定材料中无法完整核对样本量与模型摘要，需补充 summary.json 或统计表。'
 const interpretation=`# 结果解读：土壤水分与草地生物量\n\n> 合成数据工程验收；本段由确定性模型夹具基于实际文件生成。\n\n## 问题与数据\n\n考察土壤水分（%）与地上生物量（g/m²）的线性关联。输入引用为 data/raw/grassland.csv；单位来自脚本字段及本案例设定，不能用于真实野外推断。\n\n## 过滤、方法与实际结果\n\n${details}\n\n依据：${summaryFile?.path??table?.path??'未提供统计结果'}。方法为带截距普通最小二乘；没有计算 p 值、置信区间或外部验证。\n\n## 图表阅读\n\nmodel.csv 为总体样本及回归摘要，summary.json 保存相同指标。regression.png 的散点和拟合线对应此分析；本次模型只接收文件元信息，图像像素与坐标需在预览核对，不能据此宣称视觉验收。\n\n## 可支持的结论与限制\n\n在此合成数据中关联方向为正；不代表水分变化导致生物量变化。拟合优度不能代替独立预测验证，缺少混杂控制、独立样地、p 值与置信区间。本报告未宣称运行验证通过。`
 const generated={readme:`# 科研分析交付\n\n这是合成草地 OLS 案例。先读结果解读，再核对统计表和图。\n\n## 运行\n\n原始输入仅引用：data/raw/grassland.csv（30 条合成观测，-999 为生物量缺失编码）。请将该文件放入运行根目录的 data/raw/。\n\nPython 3 标准库 csv/json/pathlib/struct/zlib/math；本次只整理，未查询实际版本，不编造依赖锁定。\n\n命令：\n\n\`\`\`sh\n<已配置的Python> scripts/analysis/run_analysis.py <原工作区> <全新输出目录>\n\`\`\`\n\n输出 model.csv、summary.json、analysis_report.md、regression.png。生成脚本保留明确 argv 参数，不依赖当前内核。原文件保存在 files/；原始输入不复制。\n\n## 验证状态\n\n整理不运行分析。验证方案先比较 model.csv 和 summary.json 的完整数据；图像需要单独查看，科学结论仍需审阅。最新验证结果以工作台交付记录及 validation 下 verification.json 为准。`,interpretation,scripts:script?[{path:'analysis/run_analysis.py',content:script.text}]:[],gaps:[...(!script?['没有选定本案例脚本，无法生成可确认的运行方案']:[]),...(!summary?['缺少完整模型摘要，解读范围有限']:[])]}
 if(script&&table&&summaryFile)generated.validation={language:'python',script:'analysis/run_analysis.py',args:['{workspace}','{output}'],comparisons:[{source:table.path,output:'model.csv',kind:'table'},{source:summaryFile.path,output:'summary.json',kind:'json'}],note:'完整比较统计表与 JSON 数值。PNG 仅交回预览，未纳入自动像素比较；不宣称科学独立核验。'}
 return JSON.stringify(generated)
}
