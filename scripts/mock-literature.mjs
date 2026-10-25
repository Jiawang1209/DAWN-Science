const text=content=>typeof content==='string'?content:(content??[]).map(b=>b.text??'').join('\n')
function turn(body) {
  const messages=body.messages??[],index=messages.findLastIndex(m=>m.role==='user')
  const request=text(messages[index]?.content)
  if(!request.includes('文献检索验收'))return undefined
  const current=messages.slice(index+1),calls=current.flatMap(m=>m.tool_calls??[])
  const results=current.filter(m=>m.role==='tool').map(m=>{
    let data
    try{data=JSON.parse(text(m.content))}catch{data={error:text(m.content)}}
    return {name:m.name??calls.find(c=>c.id===m.tool_call_id)?.function?.name,data}
  })
  const crossref=request.includes('Crossref\u6587\u732e\u68c0\u7d22\u9a8c\u6536')
  return {request,results,source:crossref?'Crossref':'OpenAlex',searchName:crossref?'crossref_search':'openalex_search',doiName:crossref?'crossref_lookup_doi':'openalex_lookup_doi',saveName:crossref?'crossref_save':'literature_save',available:name=>(body.tools??[]).some(t=>t.function?.name===name)}
}
/** Select only recordIds actually returned by this turn's real client. */
export function literatureMockTool(body) {
  const t=turn(body)
  if(!t||t.results.at(-1)?.data?.error)return undefined
  if(!t.results.length)return t.available(t.searchName)?{toolName:t.searchName,args:{query:t.request.includes('限流')?'rate-limit-fixture':t.request.includes('无结果')?'no-results-fixture':'soil warming',from_year:2020,to_year:2025,limit:5}}:undefined
  if(!t.results[0].data.records?.length||t.request.includes('只检索'))return undefined
  if(!t.results.some(r=>r.name===t.doiName))return {toolName:t.doiName,args:{doi:'10.1234/example'}}
  if(!t.results.some(r=>r.name===t.saveName)&&t.available(t.saveName))return {toolName:t.saveName,args:{record_ids:[t.results[0].data.records[0].recordId],directory:'outputs/literature'}}
  return undefined
}
export function literatureMockReply(body) {
  const t=turn(body)
  if(!t)return undefined
  const data=t.results.at(-1)?.data
  if(data?.error)return `文献操作未完成：${data.error.message??data.error}。没有把失败当作核验成功。`
  if(!data)return '请先在设置 → 插件启用科研文献，然后新建会话。'
  if(data.paths)return `文献清单已保存：\n\n${data.paths.map(p=>`- [${p}](${p})`).join('\n')}\n\n仅核对索引元数据，不代表已阅读全文。`
  if(!data.records?.length)return `${t.source} 本次未查到记录；不能据此认定论文不存在。`
  return `本次实际查到 ${data.returned} 条记录，仅核对索引元数据。${t.request.includes('只检索')?'本轮只检索。':'保存工具未启用，尚未保存清单。'}`
}
