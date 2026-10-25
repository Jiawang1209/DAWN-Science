export type LiteratureSource = 'OpenAlex' | 'Crossref'
export type LiteratureErrorCode = 'invalid_input' | 'invalid_response' | 'source_mismatch' | 'rate_limited' | 'access_denied' | 'service_error' | 'response_too_large' | 'cancelled' | 'timeout' | 'network_error'
export class LiteratureError extends Error {
  constructor(readonly code: LiteratureErrorCode, message: string) { super(message); this.name = 'LiteratureError' }
}
export interface LiteratureRecord {
  id: string; title: string; authors: string[]; authorsTruncated: boolean
  year: number | null; date: string | null; journal: string | null; doi: string | null
  abstract: string | null; abstractStatus: 'available' | 'missing' | 'invalid' | 'truncated'
  sourceUrl: string; landingPageUrl: string | null
}
export interface LiteratureReport {
  source: LiteratureSource; retrievedAt: string; requestUrl: string
  query: { kind: 'search' | 'doi'; value: string; fromYear?: number; toYear?: number; limit: number }
  total: number; returned: number; records: LiteratureRecord[]; warnings: string[]
}
export interface LiteratureSearch { query: string; fromYear?: number | undefined; toYear?: number | undefined; limit?: number | undefined }
export interface LiteratureClientOptions { fetch?: typeof fetch; now?: () => Date; timeoutMs?: number; maxBytes?: number }
export interface LiteratureClient {
  search(input: LiteratureSearch, signal?: AbortSignal): Promise<LiteratureReport>
  getByDoi(value: string, signal?: AbortSignal): Promise<LiteratureReport>
}
export function normalizeDoi(value: string): string {
  if(typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value))throw new LiteratureError('invalid_input','DOI 格式无效')
  const doi=value.trim().replace(/^doi:\s*/i,'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').toLowerCase()
  if(!/^10\.\d{4,9}\/[^\s]+$/.test(doi)||doi.length>500)throw new LiteratureError('invalid_input','请输入 DOI 或 doi.org 链接')
  return doi
}
export function safeHttpUrl(value: unknown): string | null {
  try { const u=new URL(String(value));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null } catch { return null }
}
export function validateSearch(input: LiteratureSearch) {
  const query=typeof input.query==='string'?input.query.trim():'',limit=input.limit??10
  if(!query||query.length>300||/[\x00-\x1f\x7f]/.test(query)||!Number.isInteger(limit)||limit<1||limit>25)throw new LiteratureError('invalid_input','检索词需为 1–300 字，数量需为 1–25 的整数')
  const years=[input.fromYear,input.toYear].filter((y):y is number=>y!==undefined)
  if(years.some(y=>!Number.isInteger(y)||y<1000||y>2100)||(input.fromYear!==undefined&&input.toYear!==undefined&&input.fromYear>input.toYear))throw new LiteratureError('invalid_input','年份范围无效')
  return {query,limit}
}
