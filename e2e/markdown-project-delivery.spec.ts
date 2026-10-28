import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, 在项目里开会话, 进坞 } from './fixtures.js'
import type { DeliveryRecord } from '../src/protocol/delivery.js'

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')
function seed(workspace:string){
  for(const dir of ['analysis/scripts','figures','results/reports'])mkdirSync(join(workspace,dir),{recursive:true})
  writeFileSync(join(workspace,'analysis/scripts/01_clean.py'),"# Step 1: saved before this session\nprint('cleaned')\n")
  writeFileSync(join(workspace,'analysis/scripts/02_plot.R'),"# Step 2: saved before this session\nprint('plot')\n")
  writeFileSync(join(workspace,'figures/结果 一.png'),PNG)
  writeFileSync(join(workspace,'results/reports/分析记录.md'),'# 分步分析记录\n\n![结果图](../../figures/结果%20一.png)\n\n[第一步脚本](../../analysis/scripts/01_clean.py)\n\n[第二步脚本](../../analysis/scripts/02_plot.R)\n')
}

test('Markdown 相对图片实际解码，分步脚本链接进入只读预览',async({dawn},info)=>{
  const {page,workspace}=dawn;seed(workspace)
  await 在项目里开会话(page)
  await 进坞(page,'文件')
  await page.getByRole('button',{name:'results',exact:true}).click()
  await page.getByRole('button',{name:'reports',exact:true}).click()
  await page.getByRole('button',{name:/^分析记录\.md/}).click()
  const image=page.locator('.file-preview').getByRole('img',{name:'结果图',exact:true})
  await expect(image).toBeVisible()
  await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1)
  await page.screenshot({path:info.outputPath('markdown-relative-files.png')})
  await page.getByRole('link',{name:'第一步脚本',exact:true}).click()
  await expect(page.locator('.preview-code')).toContainText("print('cleaned')")
  // Reading a script never executes it.
  await expect(page.locator('.kout')).toHaveCount(0)
  await page.getByRole('button',{name:/^分析记录\.md/}).click()
  await page.getByRole('link',{name:'第二步脚本',exact:true}).click()
  await expect(page.locator('.preview-code')).toContainText("print('plot')")
})

test('整理交付可选整个项目的已有分步脚本和图片，保持原文件字节',async({dawn},info)=>{
  const {page,workspace}=dawn;seed(workspace)
  await 在项目里开会话(page)
  await 进坞(page,'产物')
  const panel=page.getByRole('region',{name:'分析交付',exact:true})
  await panel.getByLabel('产物操作菜单',{exact:true}).click()
  await panel.getByRole('button',{name:'整理交付',exact:true}).click()
  await panel.getByRole('button',{name:'从项目添加文件',exact:true}).click()
  const picker=panel.getByRole('region',{name:'项目文件选择',exact:true})
  await picker.getByRole('button',{name:'analysis',exact:true}).click()
  await picker.getByRole('button',{name:'scripts',exact:true}).click()
  await picker.getByRole('checkbox',{name:'analysis/scripts/01_clean.py',exact:true}).check()
  await picker.getByRole('checkbox',{name:'analysis/scripts/02_plot.R',exact:true}).check()
  await picker.getByLabel('按文件名搜索项目',{exact:true}).fill('png')
  await picker.getByRole('button',{name:'搜索',exact:true}).click()
  await picker.getByRole('checkbox',{name:'figures/结果 一.png',exact:true}).check()
  await picker.getByLabel('按文件名搜索项目',{exact:true}).fill('md')
  await picker.getByRole('button',{name:'搜索',exact:true}).click()
  await picker.getByRole('checkbox',{name:'results/reports/分析记录.md',exact:true}).check()
  await page.screenshot({path:info.outputPath('project-file-selection.png')})
  await picker.getByRole('button',{name:'添加所选文件',exact:true}).click()
  await expect(panel.getByText('已选 4 个文件',{exact:true})).toBeVisible()
  await panel.getByRole('button',{name:'下一步',exact:true}).click()
  await panel.getByLabel('交付名称',{exact:true}).fill('分步脚本整理')
  await panel.getByRole('button',{name:'开始整理',exact:true}).click()
  await expect(panel.getByRole('button',{name:'阅读结果解读',exact:true})).toBeVisible({timeout:30000})
  const record=await page.evaluate(async()=>{
    const tasks=await window.dawn!.invoke('listTasks',{})
    const sessionId=(tasks.data as {sessionId:string}[])[0]!.sessionId
    const result=await window.dawn!.invoke('listAnalysisDeliveries',{sessionId})
    return (result.data as {records:DeliveryRecord[]}).records[0]!
  })
  expect(record.state).not.toBe('failed')
  for(const path of ['analysis/scripts/01_clean.py','analysis/scripts/02_plot.R','figures/结果 一.png','results/reports/分析记录.md']){
    expect(readFileSync(join(workspace,record.directory,'files',path))).toEqual(readFileSync(join(workspace,path)))
  }
  expect(readFileSync(join(workspace,record.directory,'README.md'),'utf8').length).toBeGreaterThan(10)
  await panel.getByRole('button',{name:'分析记录.md files/results/reports/分析记录.md',exact:true}).click()
  const image=page.locator('.delivery-preview').getByRole('img',{name:'结果图',exact:true})
  await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1)
  await page.getByRole('link',{name:'第一步脚本',exact:true}).click()
  await expect(page.locator('.file-preview .preview-code')).toContainText("print('cleaned')")
})

test('窄窗口英文项目文件选择可完整操作',async({dawn},info)=>{
  const {page,workspace}=dawn;seed(workspace)
  await 在项目里开会话(page)
  await page.setViewportSize({width:1280,height:808})
  await page.getByRole('button',{name:'设置',exact:true}).click()
  await page.getByRole('button',{name:'外观',exact:true}).click()
  await page.getByRole('radio',{name:'English',exact:true}).click()
  await page.getByRole('button',{name:'Settings',exact:true}).click()
  const dock=page.getByRole('button',{name:/^Panel/})
  if(await dock.getAttribute('aria-expanded')!=='true')await dock.click()
  const tab=page.getByRole('tab',{name:'Artifacts',exact:true})
  if(await tab.count())await tab.click()
  else{await page.getByRole('button',{name:'More panels',exact:true}).click();await page.getByRole('menuitem',{name:'Artifacts',exact:true}).click()}
  const panel=page.locator('.analysis-delivery')
  await panel.getByLabel('Artifact actions',{exact:true}).click()
  await panel.getByRole('button',{name:'Prepare a delivery',exact:true}).click()
  await panel.getByRole('button',{name:'Add project files',exact:true}).click()
  const picker=page.getByRole('region',{name:'Project file selection',exact:true})
  await picker.getByRole('button',{name:'analysis',exact:true}).click()
  await picker.getByRole('button',{name:'scripts',exact:true}).click()
  await picker.getByRole('checkbox',{name:'analysis/scripts/01_clean.py',exact:true}).check()
  expect(await picker.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  await page.screenshot({path:info.outputPath('project-files-narrow-en.png')})
  await picker.getByRole('button',{name:'Add selected files',exact:true}).click()
  await expect(panel.getByRole('checkbox',{name:/01_clean.py/})).toBeChecked()
})
