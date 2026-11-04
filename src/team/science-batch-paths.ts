/** Admission uses the same canonical paths and inode identities as writer reservations. */
import {localOutputReservationPaths,outputReservationKey} from '../bot/output-locks.js'
export function assertBatchOutputPaths(workspace:string,inputs:string[],outputs:string[]):void {
 const read=new Set(localOutputReservationPaths(inputs,workspace)?.map(outputReservationKey)),seen=new Set<string>()
 for(const output of outputs){const paths=localOutputReservationPaths([output],workspace)!.map(outputReservationKey);if(paths.some(p=>read.has(p)||seen.has(p)))throw new Error('批量产物路径存在别名重叠或覆盖输入');for(const p of paths)seen.add(p)}
}
