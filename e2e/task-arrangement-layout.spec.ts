import {mkdirSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
import {TaskContractSchema} from '../src/protocol/task-contract.js'

const longInput='inputs/'+Array(7).fill('original-observations-0123456789').join('/')+'/全部原始观测值.csv'
const longOutput='results/'+Array(7).fill('validated-summary-0123456789').join('/')+'/保留完整单位的统计结果.csv'
const title='核对全部观测并保留原始字段、样本、单位和缺失值处理说明，生成可复算且可核验的统计摘要'
const arrangement={dispatch:'team-v1',mode:'single',rationale:'一个输入和一个结果，无独立审阅要求；先只提交方案。',independentReview:false,questions:[],tasks:[{id:'summary',title,goal:'只使用指定输入；先确认方案，不执行文件操作。',role:'负责保留全部原始输入并说明有效样本口径的统计分析执行者',inputs:[longInput],outputs:[longOutput],dependencies:[],acceptance:'用户确认单位与样本口径后，才可进入原有权限和验收流程。',review:false,execution:{agent:'data-engineer',contract:TaskContractSchema.parse({access:'workspace-write',inputs:[longInput],outputs:[longOutput],resultType:'model-metrics',submission:'tool'})}}]}
test.use({dawnOptions:{gitInit:true,toolCall:[{when:'长路径布局验收',toolName:'propose_plan',args:{title:'长内容方案',plan:'## 问题与假设\n布局验收\n## 数据与切分\n仅指定输入\n## 统计检验与模型\n等待确认\n## 图\n未执行\n## 产物\n等待确认',arrangement},once:true}]}})
test('preserves long task identities and expanded paths in a narrow real Electron view',async({dawn},testInfo)=>{
 const{page}=dawn
 await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
 await 在项目里开会话(page);await 进坞(page,'团队')
 const auto=page.getByRole('region',{name:'自动安排',exact:true})
 await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('长路径布局验收：先提出单任务方案，等待我确认，不执行。')
 await auto.getByRole('button',{name:'生成安排',exact:true}).click()
 await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('1 个任务块')
 const card=auto.locator('[data-arrangement-task="summary"]')
 await expect(card).toContainText(title)
 await card.getByText('文件与验收条件',{exact:true}).click()
 await expect(card.getByText(longInput,{exact:true})).toBeVisible()
 await expect(card.getByText(longOutput,{exact:true})).toBeVisible()
 const geometry=await card.evaluate(el=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,paths:[...el.querySelectorAll('dd')].map(dd=>({clientWidth:dd.clientWidth,scrollWidth:dd.scrollWidth}))}))
 expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1)
 for(const path of geometry.paths)expect(path.scrollWidth).toBeLessThanOrEqual(path.clientWidth+1)
 const out=resolve(process.env.DAWN_ARRANGEMENT_LAYOUT_EVIDENCE_DIR??testInfo.outputPath('long-arrangement'))
 mkdirSync(out,{recursive:true})
 await card.evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:join(out,'long-card-top.png')})
 // A wrapped field can be taller than the viewport. Prove both ends can be read,
 // rather than requiring all characters to occupy the viewport simultaneously.
 const endpoints=[]
 for(const [index,path] of [longInput,longOutput].entries())for(const end of [false,true]){
  const field=card.getByText(path,{exact:true})
  const endpoint=await field.evaluate((el,end)=>{
   el.scrollIntoView({block:end?'end':'start'})
   const text=el.firstChild!,length=text.textContent!.length,range=document.createRange()
   range.setStart(text,end?length-1:0);range.setEnd(text,end?length:1)
   const rect=range.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)
   return{end,height:el.clientHeight,scrollHeight:el.scrollHeight,visible:hit===el||!!hit&&el.contains(hit),rect:rect.toJSON()}
  },end)
  endpoints.push(endpoint);expect(endpoint.visible).toBe(true);expect(endpoint.scrollHeight).toBeLessThanOrEqual(endpoint.height+1)
  await page.screenshot({path:join(out,`path-${index}-${end?'end':'start'}.png`)})
 }
 writeFileSync(join(out,'long-path-geometry.json'),JSON.stringify({geometry,endpoints},null,2)+'\n')
 await expect(page.locator('main.main .chip-group .chip')).toHaveCount(0)
 await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
 await expect(auto.locator('[data-arrangement-task="summary"]')).toContainText(title)
 await page.keyboard.press('Escape')
 await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
 await expect(auto.locator('[data-arrangement-task="summary"]')).toContainText(longOutput)
})
