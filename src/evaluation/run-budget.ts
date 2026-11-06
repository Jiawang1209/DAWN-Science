/** Pair checks keep a deliberate budget stop distinct from completing all requested work. */
export interface RunBudgetEvaluationRow {
 mode:'unlimited'|'limited';inputHash:string;inputPreserved:boolean;started:number;accepted:number;rejected:number;modelRequests:number;preservedHashes:string[];recoveryConsumed:number
}
export function summarizeRunBudget(rows:RunBudgetEvaluationRow[]){
 const a=rows.find(row=>row.mode==='unlimited'),b=rows.find(row=>row.mode==='limited')
 if(rows.length!==2||!a||!b||a.inputHash!==b.inputHash||!a.inputPreserved||!b.inputPreserved||a.started!==3||a.accepted!==3||a.rejected!==0||b.started!==2||b.accepted!==2||b.rejected!==1||a.recoveryConsumed!==a.started||b.recoveryConsumed!==b.started||a.preservedHashes.length!==2||JSON.stringify(a.preservedHashes)!==JSON.stringify(b.preservedHashes))throw new Error('预算评测不可比较、已验收产物改变或恢复记账不一致')
 return{preventedStarts:a.started-b.started,localModelRequestsAvoided:a.modelRequests-b.modelRequests,acceptedArtifactsPreserved:true,requestedWorkCompleted:{unlimited:3,limited:2},limitations:['确定性 localhost 推理、真实 Pi/进程/脚本/文件与宿主验收；不是实际付费模型收益。','预算组有意少完成一项请求；减少请求次数不代表科研质量提升。','时长仅记录；未知 token 不按零消耗解释。']}
}
