/** Shared tool-kind rules. Positive evidence also needs host-observed status, unique IDs and scope. */
export const executionEvidenceTool=(name:string)=>['run_code','bash','powershell'].includes(name)
export const verificationEvidenceTool=(name:string)=>executionEvidenceTool(name)||name==='read'||name==='look_at_image'
export function positiveReferenceKinds(record:{name:string;status:'done'|'error';execution?:string|undefined}):string[]{
 if(record.status!=='done')return[]
 return[...(executionEvidenceTool(record.name)&&record.execution==='ran'?['execution.completed']:[]),...(verificationEvidenceTool(record.name)?['verification.reviewed']:[])]
}
