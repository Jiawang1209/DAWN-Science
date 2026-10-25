import {expect,it} from 'vitest'
// @ts-expect-error Shared deterministic JavaScript mock has no runtime dependency on TS.
import {scienceMockTool,scienceMockReply} from '../../scripts/mock-science.mjs'
const tools=['geo_search','geo_get_series','geo_save'].map(name=>({function:{name}}))
it('科研 mock 只响应验收标记，关闭时不调用，错误停止而非冒充成功',()=>{
 expect(scienceMockTool({messages:[{role:'user',content:'normal'}],tools})).toBeUndefined()
 const messages=[{role:'user',content:'科研数据验收 GEO'}]
 expect(scienceMockTool({messages,tools})).toEqual({toolName:'geo_search',args:{query:'drought',limit:2}})
 expect(scienceMockTool({messages,tools:[]})).toBeUndefined()
 const failed={messages:[...messages,{role:'tool',name:'geo_search',content:JSON.stringify({error:{message:'offline'}})}],tools}
 expect(scienceMockTool(failed)).toBeUndefined();expect(scienceMockReply(failed)).toContain('操作未完成')
})
it('mock 只保存详情返回的实际 recordId，不拼造元数据',()=>{
 const messages=[{role:'user',content:'科研数据验收 GEO'},
 {role:'tool',name:'geo_search',content:JSON.stringify({records:[{recordId:'search-id'}]})},
 {role:'tool',name:'geo_get_series',content:JSON.stringify({records:[{recordId:'detail-id'}]})}]
 expect(scienceMockTool({messages,tools})).toEqual({toolName:'geo_save',args:{record_ids:['detail-id'],directory:'outputs/datasets'}})
})
