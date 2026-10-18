/** Real Electron/runtime/file viewer; deterministic inference is engineering evidence. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { test, expect, 在项目里开会话 } from './fixtures.js'
const step={id:'P1',title:'查看已有图表',purpose:'核对已登记的 PDF，未执行科研分析',inputs:[],outputs:[],dependencies:[],status:'pending',blockers:[],cases:[],deliverables:[{path:'figure.pdf'},{path:'figure.png'}],execution:{state:'not_run',note:'仅登记已有文件'},verification:{state:'unreviewed',note:'未审查'},needsReview:false,notes:[]}
test.describe('route map shared viewer',()=>{
  test.use({dawnOptions:{toolCall:{toolName:'update_analysis_route',args:{expectedRevision:0,route:{title:'已有图表路线',goal:'查看图表',dataContext:[],steps:[step]}},once:true}}})
  test('PDF preserves usable height, map and draft while closing and reopening dock',async({dawn})=>{
    const {page}=dawn
    const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica)
    doc.addPage([480,440]).drawText('Existing scientific figure',{x:30,y:350,size:20,font})
    writeFileSync(join(dawn.workspace,'figure.pdf'),await doc.save())
    await 在项目里开会话(page)
    const composer=page.locator('main.main .composer-field')
    await composer.fill('登记已有图表文件');await composer.press('Enter')
    await page.locator('.analysis-route-summary').click()
    const pane=page.locator('.analysis-route-pane')
    await pane.getByRole('tab',{name:'本步产物 2',exact:true}).click()
    await composer.fill('查看图表时保留的草稿')
    await pane.getByText('PDF 版本 · 1 个文件',{exact:true}).click()
    await pane.getByRole('button',{name:'figure.pdf',exact:true}).click()
    const canvas=pane.locator('.route-file-preview canvas')
    await expect(canvas).toHaveAttribute('data-rendered','true')
    const pngData=await canvas.evaluate((el:HTMLCanvasElement)=>el.toDataURL('image/png'))
    writeFileSync(join(dawn.workspace,'figure.png'),Buffer.from(pngData.split(',')[1]!, 'base64'))
    await expect(pane.getByRole('region',{name:'分析路线图'})).toBeVisible()
    expect((await pane.locator('.visual-preview-stage').boundingBox())!.height).toBeGreaterThan(180)
    await page.getByRole('button',{name:'关闭面板',exact:true}).click()
    await page.locator('.analysis-route-summary').click()
    await expect(canvas).toHaveAttribute('data-rendered','true')
    await pane.getByRole('button',{name:'收起预览',exact:true}).click()
    await expect(pane.getByRole('button',{name:'figure.pdf',exact:true})).toBeFocused()
    await expect(composer).toHaveValue('查看图表时保留的草稿')
    await pane.getByRole('button',{name:'figure.png',exact:true}).click()
    await pane.locator('.visual-preview img').evaluate((el:HTMLImageElement)=>el.decode())
    await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(1440,660))
    await page.locator('.body').evaluate(async el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))))
    const image=pane.locator('.visual-preview img')
    const imageBox=(await image.boundingBox())!,stage=(await pane.locator('.visual-preview-stage').boundingBox())!
    expect(imageBox.y).toBeGreaterThanOrEqual(stage.y-1)
    expect(imageBox.y+imageBox.height).toBeLessThanOrEqual(stage.y+stage.height+1)
    expect(imageBox.height).toBeGreaterThan(50)

  })
})
test.describe('route map active turn',()=>{
  test.use({dawnOptions:{toolCall:{when:'[analysis_route_action]',toolName:'bash',args:{command:'sleep 4'},once:true}}})
  test('viewing another node does not move the active step and ends with the actual turn',async({dawn})=>{
    const {page}=dawn
    await 在项目里开会话(page)
    const composer=page.locator('main.main .composer-field')
    await composer.fill('演示分析路线：只规划');await composer.press('Enter')
    await expect(page.getByRole('button',{name:'停止生成',exact:true})).toHaveCount(0)
    await page.locator('.analysis-route-summary').click()
    const pane=page.locator('.analysis-route-pane')
    await pane.getByRole('button',{name:'继续这一步',exact:true}).click()
    const active=pane.locator('[data-route-step="S1"]')
    await expect(active).toHaveAttribute('data-state','active')
    await pane.getByRole('button',{name:/查看步骤 S3 /}).click()
    await expect(active).toHaveAttribute('data-state','active')
    mkdirSync('tmp/route-map-e2e',{recursive:true})
    await page.screenshot({path:'tmp/route-map-e2e/active-viewing-other-step.png'})
    await expect(pane.locator('[data-route-step="S3"]')).toHaveAttribute('aria-pressed','true')
    await expect(pane.locator('.route-current-position')).toContainText('输入与 Alpha 多样性')
    await expect(pane.getByRole('button',{name:'继续这一步',exact:true})).toBeDisabled()
    await pane.getByRole('button',{name:'回到当前步骤',exact:true}).click()
    await expect(active).toHaveAttribute('aria-pressed','true')
    await expect(page.getByRole('button',{name:'停止生成',exact:true})).toHaveCount(0)
    await expect(active).not.toHaveAttribute('data-state','active')
  })
})

test.describe('route map user confirmation',()=>{
  test.use({dawnOptions:{toolCall:{when:'[analysis_route_action]',toolName:'ask_user_question',args:{questions:[{id:'scope',header:'分析范围',question:'是否保留异常样本？',options:[{label:'保留',description:'本次保留全部样本'},{label:'先核对',description:'确认来源后再继续'}]}]},once:true}}})
  test('keeps confirmation in the main conversation and shows its actual location on the map',async({dawn})=>{
    const {page}=dawn
    await 在项目里开会话(page)
    const composer=page.locator('main.main .composer-field')
    await composer.fill('演示分析路线');await composer.press('Enter')
    await page.locator('.analysis-route-summary').click()
    const pane=page.locator('.analysis-route-pane')
    await pane.getByRole('button',{name:'继续这一步',exact:true}).click()
    await expect(page.locator('main.main .question-card')).toContainText('是否保留异常样本')
    await expect(pane.locator('[data-route-step="S1"]')).toHaveAttribute('data-state','awaiting')
    await expect(pane).toContainText('请在主对话完成提问或权限确认。')
    await expect(pane.getByRole('button',{name:'继续这一步',exact:true})).toBeDisabled()
    mkdirSync('tmp/route-map-e2e',{recursive:true})
    await page.screenshot({path:'tmp/route-map-e2e/awaiting-user-confirmation.png'})
    await page.locator('main.main .question-card').getByText('保留',{exact:true}).click()
    await page.locator('main.main .question-card').getByRole('button',{name:'提交答案',exact:true}).click()
    await expect(pane.locator('[data-route-step="S1"]')).not.toHaveAttribute('data-state','awaiting')
  })
})
