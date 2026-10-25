const text=c=>typeof c==='string'?c:(c??[]).map(b=>b.text??'').join('\n')
function turn(body){
 const messages=body.messages??[],index=messages.findLastIndex(m=>m.role==='user'),request=text(messages[index]?.content)
 if(!request.includes('科研数据验收'))return
 const prefix='geo',accession='GSE123',current=messages.slice(index+1),calls=current.flatMap(m=>m.tool_calls??[])
 const results=current.filter(m=>m.role==='tool').map(m=>{
  let data;try{data=JSON.parse(text(m.content))}catch{data={error:text(m.content)}}
  return {name:m.name??calls.find(c=>c.id===m.tool_call_id)?.function?.name,data}
 })
 return {request,prefix,accession,results,available:name=>(body.tools??[]).some(t=>t.function?.name===name)}
}
export function scienceMockTool(body){
 const t=turn(body);if(!t||t.results.at(-1)?.data?.error)return
 const search=`${t.prefix}_search`,detail='geo_get_series',save=`${t.prefix}_save`
 if(!t.results.length)return t.available(search)?{toolName:search,args:{query:t.request.includes('限流')?'rate-limit-fixture':t.request.includes('无结果')?'no-results-fixture':'drought',limit:2}}:undefined
 if(!t.results[0].data.records?.length||t.request.includes('只检索'))return
 if(!t.results.some(r=>r.name===detail))return {toolName:detail,args:{accession:t.accession}}
 if(!t.results.some(r=>r.name===save)&&t.available(save)){
  const record=t.results.find(r=>r.name===detail)?.data.records?.[0]
  return record?{toolName:save,args:{record_ids:[record.recordId],directory:'outputs/datasets'}}:undefined
 }
}
export function scienceMockReply(body){
 const t=turn(body);if(!t)return
 const r=t.results.at(-1)?.data
 if(r?.error)return `科研数据操作未完成：${r.error.message??r.error}。`
 if(!r)return '科研数据插件已关闭，请在设置中开启后新建 API 会话。'
 if(r.paths)return `科研数据清单已保存：\n\n${r.paths.map(p=>`- [${p}](${p})`).join('\n')}\n\n仅整理来源元数据，没有下载原始数据。`
 if(!r.records?.length)return '本次未查到记录，不能据此认定数据集不存在。'
 return `实际查到 ${r.returned} 条记录。${t.request.includes('只检索')?'本轮只检索，不写文件。':'尚未保存清单。'}`
}
