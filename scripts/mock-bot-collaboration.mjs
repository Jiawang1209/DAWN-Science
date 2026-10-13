/** Shared deterministic collaboration scenario. Only inference is scripted; tools and files are real. */
const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(p=>p?.text??'').join('') : ''
const codeCommand = code => `python3 - <<'DAWN_COLLAB_PY'\n${code}\nDAWN_COLLAB_PY`
const inspectCode = `import csv,json
rows=list(csv.DictReader(open('input.csv')))
print('OBSERVED_INPUT='+json.dumps({'rows':len(rows),'suspect':[r for r in rows if float(r['y']) < -100]}))`
const dictionaryCode = `import json,time
time.sleep(1)
d=json.load(open('data-dictionary.json'))
print('DICTIONARY_CODE='+str(d['missing_code'])+'; meaning='+d['meaning'])`
const userRequestCode = `import pathlib,json
pathlib.Path('notes').mkdir(exist_ok=True)
pathlib.Path('notes/figure-request.json').write_text(json.dumps({'title':'协作分析验收','show_sample_size':True,'show_excluded':True},ensure_ascii=False))
print('USER_REQUIREMENT_SAVED: 图中标注样本量及排除条数，标题为协作分析验收。')`
const checkCode = `import csv,json,pathlib,time
time.sleep(1)
rows=list(csv.DictReader(open('input.csv')))
dictionary=json.load(open('data-dictionary.json'))
code=dictionary['missing_code']
clean=[r for r in rows if float(r['y'])!=code]
pathlib.Path('results').mkdir(exist_ok=True)
pathlib.Path('notes').mkdir(exist_ok=True)
with open('results/clean.csv','w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=['x','y']);w.writeheader();w.writerows(clean)
pathlib.Path('notes/data-check.md').write_text('Missing code '+str(code)+' confirmed from data-dictionary.json; excluded='+str(len(rows)-len(clean))+'; original input.csv preserved.')
print('CONFIRMED_MISSING_CODE='+str(code)+'; excluded='+str(len(rows)-len(clean))+'; use results/clean.csv. Evidence: notes/data-check.md')`
const modelCode = `# Missing code confirmed by data Bot before this original task resumed.
import csv,json,pathlib
rows=list(csv.DictReader(open('results/clean.csv')))
assert '-999' in pathlib.Path('notes/data-check.md').read_text()
x=[float(r['x']) for r in rows];y=[float(r['y']) for r in rows]
mx=sum(x)/len(x);my=sum(y)/len(y)
slope=sum((a-mx)*(b-my) for a,b in zip(x,y))/sum((a-mx)**2 for a in x)
intercept=my-slope*mx
excluded=len(list(csv.DictReader(open('input.csv'))))-len(rows)
m={'n':len(rows),'slope':slope,'intercept':intercept,'excluded':excluded}
pathlib.Path('results/model.json').write_text(json.dumps(m))
with open('results/model.csv','w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(m));w.writeheader();w.writerow(m)
pathlib.Path('notes/method.md').write_text('Data Bot confirmed -999 as missing using the dictionary. Excluded '+str(excluded)+' row; input.csv unchanged. OLS with intercept on '+str(len(rows))+' rows. Toy example; no inferential claim.')
print('MODEL_COMPUTED='+json.dumps(m))`
const plotCode = `# Plot Bot clarifies requirements and reads the user's actual saved figure request.
import csv,json,pathlib,html
m=json.load(open('results/model.json'))
rows=list(csv.DictReader(open('results/clean.csv')))
request_file=pathlib.Path('notes/figure-request.json')
request=json.loads(request_file.read_text()) if request_file.exists() else {'title':'Regression','show_sample_size':True,'show_excluded':True}
pathlib.Path('figures').mkdir(exist_ok=True)
points=''.join('<circle cx="'+str(30+float(r['x'])*55)+'" cy="'+str(220-float(r['y'])*15)+'" r="4" fill="teal"/>' for r in rows)
label='y = '+str(m['slope'])+'x + '+str(m['intercept'])
if request['show_sample_size']: label+='; n='+str(m['n'])
if request['show_excluded']: label+='; excluded='+str(m['excluded'])
svg='<svg xmlns="http://www.w3.org/2000/svg" width="420" height="280"><rect width="420" height="280" fill="white"/><text x="30" y="24">'+html.escape(request['title'])+'</text><path d="M85 175 L305 55" stroke="teal" stroke-width="2"/>'+points+'<text x="30" y="260">'+html.escape(label)+'</text></svg>'
pathlib.Path('figures/regression.svg').write_text(svg)
print('PLOT_READY: figures/regression.svg; scripts/plot.py; '+label)`
const saveAndRun = (path,code) => codeCommand(`import pathlib\npathlib.Path('scripts').mkdir(exist_ok=True)\npathlib.Path(${JSON.stringify(path)}).write_text(${JSON.stringify(code)})\nexec(compile(open(${JSON.stringify(path)}).read(),${JSON.stringify(path)},'exec'))`)
const verifyCode = `import json,pathlib
m=json.load(open('results/model.json'))
paths=['scripts/model.py','scripts/plot.py','results/model.csv','notes/data-check.md','notes/method.md','figures/regression.svg']
assert all(pathlib.Path(p).is_file() for p in paths)
assert m['n']==5 and m['excluded']==1
print('DELIVERY_VERIFIED='+json.dumps(m)+'; '+' '.join(chr(96)+p+chr(96) for p in paths))`
function context(body) {
 const messages=body.messages??[],last=messages.at(-1)
 const system=text(messages.find(m=>m.role==='system'||m.role==='developer')?.content)
 const fullUser=text(messages.findLast(m=>m.role==='user')?.content)
 const user=fullUser.split('\n\n[团队公共对话')[0]
 const call=messages.findLast(m=>m.role==='assistant'&&m.tool_calls?.length)?.tool_calls?.at(-1)?.function?.name
 const role=system.includes('BOT_COLLAB_DATA')?'data':system.includes('BOT_COLLAB_STATS')?'stats':system.includes('BOT_COLLAB_PLOT')?'plot':undefined
 return {messages,last,system,user,fullUser,call,role}
}
export function botCollaborationTool(body) {
 const {last,user,call,role,messages}=context(body)
 if(role) {
  if(last?.role==='user') {
   if(role==='stats'&&user.startsWith('[team-user:')&&user.includes('协作分析验收'))return {toolName:'bash',args:{command:codeCommand(userRequestCode)}}
   if(role==='stats'&&user.startsWith('任务 '))return {toolName:'bash',args:{command:codeCommand(inspectCode)}}
   if(role==='data'&&user.startsWith('[bot-request:'))return {toolName:'bash',args:{command:codeCommand(dictionaryCode)}}
   if(role==='data'&&user.startsWith('[bot-reply:')&&user.includes('缺失行排除'))return {toolName:'bash',args:{command:codeCommand(checkCode)}}
   if(role==='plot'&&user.startsWith('[bot-request:'))return {toolName:'bot_message',args:{to:'stats',message:'绘图前确认一下：图中是否同时标注样本量和排除条数？标题是否沿用用户在团队对话里补充的要求？'}}
   if(role==='plot'&&user.startsWith('[bot-reply:')&&user.includes('按用户补充的要求'))return {toolName:'bash',args:{command:saveAndRun('scripts/plot.py',plotCode)}}
   if(role==='stats'&&user.startsWith('[bot-reply:')) {
    if(user.includes('图已生成'))return {toolName:'bash',args:{command:codeCommand(verifyCode)}}
    if(user.includes('确认缺失编码 -999'))return {toolName:'bash',args:{command:saveAndRun('scripts/model.py',modelCode)}}
   }
  }
  if(role==='data'&&last?.role==='tool'&&call==='bash'&&text(last.content).includes('DICTIONARY_CODE=-999'))return {toolName:'bot_message',args:{to:'stats',message:'字典确认 -999 是缺失编码。请确认缺失值处理策略：本次演示是将缺失行排除后拟合，还是需要另做插补？我会保留原始文件。'}}
  if(role==='stats'&&last?.role==='tool'&&call==='bash') {
   if(text(last.content).includes('OBSERVED_INPUT='))return {toolName:'bot_colleagues',args:{}}
   if(text(last.content).includes('MODEL_COMPUTED='))return {toolName:'bot_say',args:{message:'已根据数据助手的核查完成拟合，模型结果已保存。接下来请绘图助手协作出图。'}}
  }
  if(role==='stats'&&last?.role==='tool'&&call==='bot_say')return {toolName:'bot_message',args:{to:'plot',kind:'handoff',message:'请读取 results/model.json 与 results/clean.csv 生成 figures/regression.svg，保存 scripts/plot.py。请结合团队对话里的用户补充要求，遇到不明确之处可以向我确认。'}}
  if(role==='stats'&&last?.role==='tool'&&call==='bot_colleagues') {
   const inspection=messages.findLast(m=>m.role==='tool'&&text(m.content).includes('OBSERVED_INPUT='))
   if(inspection&&text(inspection.content).includes('-999'))return {toolName:'bot_message',args:{to:'data',kind:'request',message:'实际读取 input.csv 发现第六行 y=-999。请核查 data-dictionary.json 的编码含义；保留原始文件，生成可用于拟合的数据并说明排除依据，返回核查结果。'}}
  }
  return undefined
 }
 if(!user.includes('Bot交流验收')||user.includes('[bot-result:'))return undefined
 if(last?.role==='user')return {toolName:'bot_list',args:{}}
 if(last?.role==='tool'&&call==='bot_list') {
  let bots;try{bots=JSON.parse(text(last.content))}catch{return undefined}
  const data=bots.find(b=>/数据/.test(b.role)),stats=bots.find(b=>/统计/.test(b.role)),plot=bots.find(b=>/绘图/.test(b.role))
  if(!data||!stats||!plot)return undefined
  return {toolName:'team_create',args:{name:'数据分析协作',goal:'通过实际交流核查异常、调整分析并交接绘图',members:[{name:'data',botId:data.id},{name:'stats',botId:stats.id},{name:'plot',botId:plot.id}],tasks:[{id:'t1',subject:'协作完成数据分析',assignee:'stats',description:'实际读取 input.csv；发现疑问请数据助手核查；依据回应调整分析，再交接绘图并核验最终产物。',outputs:['results/clean.csv','notes/data-check.md','scripts/model.py','results/model.json','results/model.csv','notes/method.md','scripts/plot.py','figures/regression.svg']}]}}
 }
 if(last?.role==='tool'&&(call==='team_create'||call==='team_wait')&&!text(last.content).includes('所有任务都到终态'))return {toolName:'team_wait',args:{timeoutSec:10}}
 return undefined
}
export function botCollaborationReply(body) {
 const {last,role,call,user,messages}=context(body)
 if(role==='stats'&&last?.role==='user'&&user.startsWith('[bot-request:')) {
  if(user.includes('缺失值处理策略'))return '本次是协作机制演示，请将缺失行排除后拟合，不做插补；保留 input.csv，在说明中记录依据和排除条数。'
  if(user.includes('图中是否同时标注样本量'))return '需要，同时标注实际样本量和排除条数。标题按用户补充的要求；若已有 notes/figure-request.json，请读取该文件后绘图。'
 }
 if(role&&last?.role==='user'&&user.startsWith('[team-user:'))return '收到补充，我会按这条要求核对后续交付。'
 if(role&&last?.role==='tool') {
  if(call==='bot_message')return '已发出协作请求，等待队友的实际回应后继续原任务。'
  if(call==='bash') {
   const output=text(last.content)
   if(output.includes('USER_REQUIREMENT_SAVED'))return '已记录你的补充：图中注明样本量和排除条数，标题为“协作分析验收”。要求已保存到 notes/figure-request.json，绘图助手会读取。'
   if(role==='data'&&output.includes('CONFIRMED_MISSING_CODE=-999'))return '已确认缺失编码 -999，并按你确认的策略排除该行；清洗数据保存为 results/clean.csv，检查依据保存在 notes/data-check.md，input.csv 未改动。'
   if(role==='plot'&&output.includes('PLOT_READY:'))return '图已生成：figures/regression.svg；绘图脚本为 scripts/plot.py。图中标注来自实际模型，用户补充要求已从文件读取。'
   if(role==='stats'&&output.includes('DELIVERY_VERIFIED='))return '已核验数据核查、缺失值处理、模型及绘图交付。输入原始文件保持不变。可查看：'+(output.match(/`[^`]+`/g)??[]).join('、')
   return output
  }
 }
 if(!role&&messages.some(m=>m.role==='user'&&text(m.content).includes('Bot交流验收'))) {
  if(user.includes('[bot-result:'))return '已完成协作交付：数据助手核查编码后向统计助手确认处理策略，统计助手收到清洗结果后完成拟合；绘图助手追问图形要求，再读取用户补充生成图形。连续交流可在坞的“团队对话”查看，核验过的产物可从任务卡打开。'
  if(last?.role==='tool'&&call==='team_wait'&&text(last.content).includes('所有任务都到终态'))return '专业 Bot 已通过请求、回应和交接完成这次分析；正在汇总实际交付。'
 }
 return undefined
}
