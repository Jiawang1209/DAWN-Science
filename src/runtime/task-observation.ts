import {TaskObservationSchema,type TaskObservation,type TaskUsage} from '../protocol/task-observation.js'
export function taskObservation(startedAt:number,counts={submissionAttempts:0,invalidSubmissions:0},usage?:TaskUsage):TaskObservation {
 return TaskObservationSchema.parse({elapsedMs:Math.max(0,Date.now()-startedAt),...counts,...(usage&&Object.keys(usage).length?{usage}:{})})
}
