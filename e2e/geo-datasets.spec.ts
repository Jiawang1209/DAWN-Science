import {existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test,expect,在项目里开会话,进设置} from './fixtures.js'
test.use({dawnOptions:{fakeScience:true}})
const card=(page:any)=>page.locator('.plugin-card').filter({hasText:'科研数据 · GEO'})
async function send(page:any,value:string){await page.getByPlaceholder(/输入问题/).fill(value);await page.getByRole('button',{name:'发送',exact:true}).click()}
test('GEO 默认开启 → 真检索和 GSE 设计 → 清单预览；关闭持久化且新会话无工具',async({dawn},info)=>{
 const {page,workspace}=dawn
 await 进设置(page,'插件');await expect(card(page).getByRole('checkbox',{name:'启用这个插件',exact:true})).toBeChecked()
 await expect(card(page)).toContainText('默认开启')
 await page.getByRole('button',{name:'返回',exact:true}).click();await 在项目里开会话(page)
 await send(page,'科研数据验收 GEO，请查询详情并保存。')
 await expect(page.locator('.turn.agent').last()).toContainText('科研数据清单已保存',{timeout:30000})
 expect(dawn.science!.requests).toHaveLength(5)
 expect(dawn.science!.requests[0]).toMatchObject({path:'/entrez/eutils/esearch.fcgi',query:{db:'gds',term:'(drought) AND gse[ETYP]',retmax:'2'}})
 const paths=await page.getByRole('group',{name:'本轮生成的文件'}).last().textContent()
 await expect(page.getByRole('group',{name:'本轮生成的文件'}).last()).toContainText('已生成 2 个文件')
 await page.getByRole('group',{name:'本轮生成的文件'}).last().getByRole('button',{name:'展开文件列表',exact:true}).click()
 await page.getByRole('group',{name:'本轮生成的文件'}).last().getByRole('button',{name:/数据清单\.md$/}).click()
 await expect(page.locator('.right-dock .preview')).toContainText('Two conditions with biological replicates.')
 const fs=await import('node:fs'),folder=fs.readdirSync(join(workspace,'outputs/datasets'))[0]!,dir=join(workspace,'outputs/datasets',folder)
 const saved=JSON.parse(readFileSync(join(dir,'records.json'),'utf8'))
 expect(saved.records).toHaveLength(1);expect(saved.records[0]).toMatchObject({record:{accession:'GSE123',fields:{overallDesign:'Two conditions with biological replicates.'}},origin:{source:'GEO',query:{kind:'accession',value:'GSE123'}}})
 await info.attach('records.json',{path:join(dir,'records.json'),contentType:'application/json'})
 await page.screenshot({path:info.outputPath('geo-flow.png')})
 await 进设置(page,'插件');await card(page).getByRole('checkbox',{name:'启用这个插件',exact:true}).uncheck()
 await page.getByRole('button',{name:'返回',exact:true}).click();await 在项目里开会话(page);await send(page,'科研数据验收 GEO，关闭后')
 await expect(page.locator('.turn.agent').last()).toContainText('科研数据插件已关闭',{timeout:30000});expect(dawn.science!.requests).toHaveLength(5)
 const reopened=await dawn.重开();await 进设置(reopened,'插件');await expect(card(reopened).getByRole('checkbox',{name:'启用这个插件',exact:true})).not.toBeChecked()
})
for(const value of ['限流','无结果'])test(`GEO ${value}明确反馈且不保存`,async({dawn})=>{
 await 在项目里开会话(dawn.page);await send(dawn.page,`科研数据验收 GEO，${value}`)
 await expect(dawn.page.locator('.turn.agent').last()).toContainText(value==='限流'?'科研数据操作未完成':'本次未查到记录',{timeout:30000})
 expect(dawn.science!.requests).toHaveLength(1);expect(existsSync(join(dawn.workspace,'outputs/datasets'))).toBe(false)
})
test('GEO 先出方案可查询，不落盘',async({dawn})=>{
 await 在项目里开会话(dawn.page);await send(dawn.page,'/plan 科研数据验收 GEO，只检索')
 await expect(dawn.page.locator('.turn.agent').last()).toContainText('本轮只检索',{timeout:30000})
 expect(dawn.science!.requests).toHaveLength(2);expect(existsSync(join(dawn.workspace,'outputs/datasets'))).toBe(false)
})
