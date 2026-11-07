/** Current Markdown preview uses the original guarded file reader, without running linked scripts. */
import {mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话} from './fixtures.js'
const markdown='# 合成数据核查报告\n\n预览演示：图片和脚本均相对工作区读取。\n\n![analysis plot](../figures/plot.png)\n\n[analysis script](../scripts/analyse.py)\n'
const reply=JSON.stringify({summary:'report delivered',blockers:[],deliverables:[{path:'reports/report.md'}],execution:{state:'not_run',note:'document only'},verification:{state:'unreviewed',note:'preview fixture'}})
test.use({dawnOptions:{reply,toolCall:[
 {when:'审查报告预览链路',toolName:'start_subagent',args:{agent:'writer',task:'交付预览报告',contract:{access:'workspace-write',outputs:['reports/report.md']}}},
 {when:'交付预览报告',toolName:'write',args:{path:'reports/report.md',content:markdown}},
]}})
test('opens report images and scripts in the same owner, closes previews, and returns from expansion',async({dawn})=>{
 const{page,workspace}=dawn,evidence=resolve(process.env.DAWN_SUBMISSION_EVIDENCE_DIR??'docs/validation/submission-rereview-20261107/desktop')
 for(const path of ['.dawn/agents','figures','scripts'])mkdirSync(join(workspace,path),{recursive:true})
 writeFileSync(join(workspace,'.dawn/agents/writer.md'),'---\nname: writer\ndescription: writer\ntools: write\n---\nOnly write the declared report.\n')
 writeFileSync(join(workspace,'figures/plot.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=','base64'))
 writeFileSync(join(workspace,'scripts/analyse.py'),'from pathlib import Path\nPath("must-not-run.txt").write_text("executed")\n')
 await 在项目里开会话(page)
 await page.getByPlaceholder(/输入问题/).fill('审查报告预览链路');await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect(page.locator('.chip-group .chip').first()).toHaveAttribute('data-status','ok')
 await page.getByRole('button',{name:'打开协作：1 项任务 · 1 项验收通过',exact:true}).click()
 let overview=page.getByRole('region',{name:'运行总览',exact:true})
 await overview.getByRole('tab',{name:'产物',exact:true}).click()
 await overview.getByRole('button',{name:'预览当前文件：reports/report.md',exact:true}).click()
 const image=overview.getByRole('img',{name:'analysis plot',exact:true})
 await expect(image).toHaveAttribute('src',/^data:image\/png;base64,/)
 await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1)
 await overview.locator('.collaboration-file-preview').scrollIntoViewIfNeeded();mkdirSync(evidence,{recursive:true})
 await page.screenshot({path:join(evidence,'report-relative-image.png')})
 await overview.getByRole('link',{name:'analysis script',exact:true}).click()
 await expect(overview.locator('.collaboration-file-preview')).toContainText('must-not-run.txt')
 expect(existsSync(join(workspace,'must-not-run.txt'))).toBe(false)
 await page.screenshot({path:join(evidence,'report-linked-script-readonly.png')})
 await overview.getByRole('button',{name:'收起预览',exact:true}).click()
 await expect(overview.getByRole('button',{name:'预览当前文件：reports/report.md',exact:true})).toBeFocused()
 await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
 await dialog.getByRole('button',{name:'writer',exact:true}).click()
 await page.keyboard.press('Escape')
 overview=page.getByRole('region',{name:'运行总览',exact:true})
 await expect(overview.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
})
