import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect, 在项目里开会话, 进设置 } from './fixtures.js'

test.use({dawnOptions:{fakeOpenAlex:true}})
async function enable(page: Page) {
  await 进设置(page,'插件')
  const card=page.locator('.plugin-card').filter({hasText:'科研文献 · OpenAlex'})
  await expect(card.getByRole('checkbox',{name:'启用这个插件',exact:true})).toBeChecked()
  await expect(card).toContainText('仅核对索引元数据')
  await card.getByRole('checkbox',{name:'启用这个插件',exact:true}).check()
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await 在项目里开会话(page)
}
async function send(page: Page, value: string) {
  await page.getByPlaceholder(/输入问题/).fill(value)
  await page.getByRole('button',{name:'发送',exact:true}).click()
}
test('默认开启 → 界面设置并持久化 → 真工具检索、DOI 核对、只保存所选记录',async({dawn},testInfo)=>{
  const {page,workspace}=dawn
  await enable(page)
  await send(page,'文献检索验收，请检索并核对 DOI，保存第一条。')
  await expect(page.locator('.turn.agent').last()).toContainText('文献清单已保存', {timeout:30_000})
  expect(dawn.openalex!.requests).toHaveLength(2)
  expect(dawn.openalex!.requests[0]).toMatchObject({path:'/works',query:{search:'soil warming',per_page:'5',filter:'from_publication_date:2020-01-01,to_publication_date:2025-12-31'}})
  expect(dawn.openalex!.requests[1]!.path).toBe('/works/https://doi.org/10.1234/example')
  const dir=join(workspace,'outputs/literature',readdirSync(join(workspace,'outputs/literature'))[0]!)
  const data=JSON.parse(readFileSync(join(dir,'references.json'),'utf8'))
  expect(data.records).toHaveLength(1)
  expect(data.records[0]).toMatchObject({record:{id:'https://openalex.org/W12345',title:'Warming and soil diversity'},origin:{source:'OpenAlex',query:{value:'soil warming'}}})
  expect(data.records[0].origin.retrievedAt).toMatch(/^\d{4}-/)
  const markdown=readFileSync(join(dir,'文献清单.md'),'utf8')
  expect(markdown).toContain('Soil diversity changes')
  expect(markdown).toContain('未据此声称') // Caveat remains present in the actual saved file.
  await testInfo.attach('references.json',{path:join(dir,'references.json'),contentType:'application/json'})
  await testInfo.attach('文献清单.md',{path:join(dir,'文献清单.md'),contentType:'text/markdown'})
  await expect(page.getByRole('group',{name:'本轮生成的文件'}).last()).toContainText('已生成 2 个文件')
  await page.getByRole('group',{name:'本轮生成的文件'}).last().getByRole('button',{name:'展开文件列表',exact:true}).click()
  await page.getByRole('group',{name:'本轮生成的文件'}).last().getByRole('button',{name:/文献清单\.md$/}).click()
  await expect(page.locator('.right-dock .preview')).toContainText('Warming and soil diversity')
  await expect(page.locator('.right-dock .preview')).toContainText('Soil diversity changes')
  await page.screenshot({path:testInfo.outputPath('literature-flow.png')})
  await 进设置(page,'插件')
  await expect(page.locator('.plugin-card').filter({hasText:'科研文献 · OpenAlex'}).getByRole('checkbox',{name:'启用这个插件',exact:true})).toBeChecked()
  await page.locator('.plugin-card').filter({hasText:'科研文献 · OpenAlex'}).getByRole('checkbox',{name:'启用这个插件',exact:true}).uncheck()
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await 在项目里开会话(page)
  await send(page,'文献检索验收，插件关闭后')
  await expect(page.locator('.turn.agent').last()).toContainText('请先在设置',{timeout:30_000})
  expect(dawn.openalex!.requests).toHaveLength(2)
})
for(const [name,prompt,reply] of [
  ['限流','文献检索验收，限流','文献操作未完成'],
  ['无结果','文献检索验收，无结果','不能据此认定论文不存在'],
] as const)test(`${name}明确提示，工作区没有文献清单`,async({dawn})=>{
  await 在项目里开会话(dawn.page)
  await enable(dawn.page)
  await send(dawn.page,prompt)
  await expect(dawn.page.locator('.turn.agent').last()).toContainText(reply,{timeout:30_000})
  expect(dawn.openalex!.requests).toHaveLength(1)
  expect(existsSync(join(dawn.workspace,'outputs/literature'))).toBe(false)
})
test('先出方案允许只读检索，不落盘',async({dawn})=>{
  const {page}=dawn
  await 在项目里开会话(page)
  await enable(page)
  await send(page,'/plan 文献检索验收，只检索')
  await expect(page.locator('.turn.agent').last()).toContainText('本轮只检索',{timeout:30_000})
  await expect(page.locator('.plan-band')).toContainText('只看不改')
  expect(dawn.openalex!.requests).toHaveLength(1)
  expect(existsSync(join(dawn.workspace,'outputs/literature'))).toBe(false)
})
