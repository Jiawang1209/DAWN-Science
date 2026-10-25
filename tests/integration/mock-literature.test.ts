import {expect,it} from 'vitest'
// @ts-expect-error Shared deterministic scenario for development and Electron.
import {literatureMockTool,literatureMockReply} from '../../scripts/mock-literature.mjs'
const tools=['openalex_search','openalex_lookup_doi','literature_save'].map(name=>({type:'function',function:{name}}))
const user={role:'user',content:'文献检索验收'}
it('关闭工具时引导启用，历史关键词不触发下一轮场景',()=>{
  expect(literatureMockTool({messages:[user],tools:[]})).toBeUndefined()
  expect(literatureMockReply({messages:[user],tools:[]})).toContain('请先在设置')
  expect(literatureMockTool({messages:[user,{role:'user',content:'其他问题'}],tools})).toBeUndefined()
})
it('只选择实际工具返回的身份，且失败后不继续保存',()=>{
  const messages=[user,{role:'assistant',tool_calls:[{id:'s',function:{name:'openalex_search'}},{id:'d',function:{name:'openalex_lookup_doi'}}]},{role:'tool',tool_call_id:'s',content:JSON.stringify({records:[{recordId:'observed-id'}]})},{role:'tool',tool_call_id:'d',content:JSON.stringify({records:[{recordId:'doi-id'}]})}]
  expect(literatureMockTool({messages,tools})).toEqual({toolName:'literature_save',args:{record_ids:['observed-id'],directory:'outputs/literature'}})
  const failed={messages:[...messages,{role:'tool',content:JSON.stringify({error:{message:'rate limit'}})}],tools}
  expect(literatureMockTool(failed)).toBeUndefined()
  expect(literatureMockReply(failed)).toContain('文献操作未完成')
})
