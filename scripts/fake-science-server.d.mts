export const GEO_FIXTURES: Record<string,unknown>[]
export function startFakeScienceServer():Promise<{
 url:string
 requests:{path:string;query:Record<string,string>}[]
 close():Promise<void>
}>
