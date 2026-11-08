/** Explicit experiment limits only; this does not change product execution budgets. */
export const DEFAULT_RESEARCH_REQUESTS=30
export const MAX_RESEARCH_REQUESTS=300
export function researchRequestLimit(value=DEFAULT_RESEARCH_REQUESTS):number {
 if(!Number.isSafeInteger(value)||value<2||value>MAX_RESEARCH_REQUESTS)throw new Error('科研对照请求上限须为 2..300；超过默认30须显式指定')
 return value
}
export function researchStageLimits(perArmLimit:number):{work:number;review:number} {
 if(!Number.isSafeInteger(perArmLimit)||perArmLimit<2||perArmLimit>MAX_RESEARCH_REQUESTS/2)throw new Error('科研分组额度须为 2..150')
 const review=Math.ceil(perArmLimit*4/15)
 return{work:perArmLimit-review,review}
}
/** Preserve the original minimum three minutes and twelve seconds per allowed request. */
export function researchTrialTimeoutMs(perArmLimit:number):number {
 if(!Number.isSafeInteger(perArmLimit)||perArmLimit<1||perArmLimit>MAX_RESEARCH_REQUESTS/2)throw new Error('科研分组额度须为 1..150')
 return Math.max(180000,perArmLimit*12000)
}
