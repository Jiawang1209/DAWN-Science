import {mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {evaluateArrangementCases} from '../src/evaluation/auto-arrangement.js'
// @ts-expect-error same local fixture used by the shared mock inference server
import {mockAutoArrangement} from './mock-auto-arrangement.mjs'
export function runAutoArrangementEvaluation(destination:string){
 const goals=['只计算 input.csv 的均值','分别统计 east.csv 与 west.csv','清洗、建模并独立审阅 input.csv','清洗、建模并独立审阅 input.csv\n合并前两步，保留独立审阅']
 const report=evaluateArrangementCases(goals.map((goal,i)=>({id:['small','independent','review','revised'][i]!,expectedCount:[1,2,3,2][i]!,proposal:mockAutoArrangement({messages:[{role:'user',content:'请为以下具体任务自动安排。\n'+goal}]},{title:'fixture',plan:'plan'}).args.arrangement})))
 mkdirSync(destination,{recursive:true});writeFileSync(join(destination,'auto-arrangement.json'),JSON.stringify(report,null,2)+'\n')
 if(report.rows.some(row=>!row.passed))throw Error('Automatic arrangement fixture validation failed')
 return report
}
