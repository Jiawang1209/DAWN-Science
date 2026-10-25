import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import ExcelJS from 'exceljs'
import { test, expect, 在项目里开会话, 进设置 } from './fixtures.js'

const files = ['study-a.pdf', 'study-b.pdf', 'study-scan.pdf']
test.afterEach(async ({dawn}, info) => {
  const all = dawn.requests as {body?: {messages?: {role?: string; content?: unknown; tool_call_id?: string}[]}}[]
  const messages = all.map(r => r.body?.messages).findLast(ms => ms?.some(m => m.role === 'tool'))
  const path = info.outputPath('tool-results.json')
  writeFileSync(path, JSON.stringify(messages?.filter(m => m.role === 'tool') ?? [], null, 2))
  await info.attach('tool-results.json', {path, contentType: 'application/json'})
})
async function seed(workspace: string) {
  mkdirSync(join(workspace, 'papers'), {recursive: true})
  for (const [i, file] of files.entries()) {
    const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([600, 750])
    if (i < 2) {
      page.drawText(`Title: Synthetic study ${i === 0 ? 'A' : 'B'}\nDesign: Controlled plant experiment.`, {x: 40, y: 680, size: 12, font, lineHeight: 22})
      doc.addPage([600, 750]).drawText([
        ...(i === 0 ? ['Biological replicates: 8 per group.', 'Technical repeats: 3.'] : []),
        'Method: Linear model.', `Outcome: ${i === 0 ? 'Increased' : 'Decreased'}.`,
        'Limitations: One study site.',
      ].join('\n'), {x: 40, y: 680, size: 12, font, lineHeight: 22})
    }
    writeFileSync(join(workspace, 'papers', file), await doc.save({useObjectStreams: false}))
  }
  return files.map(f => createHash('sha256').update(readFileSync(join(workspace, 'papers', f))).digest('hex'))
}
const send = async (page: import('@playwright/test').Page, prompt: string) => {
  await page.getByPlaceholder(/输入问题/).fill(`/skill:literature-review ${prompt}`)
  await page.getByRole('button', {name: '发送', exact: true}).click()
}

test('默认可见且可展开；实际 PDF → 三表 Excel/总结 → 读回与产物预览', async ({dawn}, info) => {
  const {page, workspace} = dawn, hashes = await seed(workspace)
  await 进设置(page, 'Skills')
  const row = page.locator('.skill-row').filter({hasText: 'literature-review'})
  await expect(row).toContainText('文献调研')
  await expect(row).toContainText('已启用')
  await page.getByRole('button', {name: '返回', exact: true}).click()
  await 在项目里开会话(page)
  await send(page, '文献对照验收，比较 papers/ 中三份材料并导出 Excel 和 Markdown。')
  await expect(page.locator('.turn.agent').last()).toContainText(/文献对照(?:验收完成|未完成)/, {timeout: 30_000})
  expect(await page.locator('.turn.agent').last().innerText()).toContain('文献对照验收完成')
  const requests = JSON.stringify(dawn.requests)
  expect(requests).toContain('## 逐篇阅读')
  expect(requests).toContain('references/comparison.md')
  expect(requests).toContain('生物重复和技术重复')
  expect(requests).toContain('--- Page 2 ---')
  const directory = join(workspace, 'outputs/literature-review/acceptance')
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(join(directory, '论文对照.xlsx'))
  expect(book.worksheets.map(s => s.name)).toEqual(['文献清单', '逐项证据', '差异对照'])
  const overview = book.getWorksheet('文献清单')!
  expect(overview.rowCount).toBe(4)
  expect(overview.getCell('G2').text).toBe('8 per group. [P1-E3]')
  expect(overview.getCell('H2').text).toBe('3. [P1-E4]')
  expect(overview.getCell('G3').text).toContain('未提供')
  expect(overview.getCell('D4').text).toBe('文本不可提取')
  const evidence = book.getWorksheet('逐项证据')!
  const n = evidence.getRows(2, evidence.rowCount - 1)!.find(r => r.getCell(1).text === 'P1-E3')!
  expect(n.getCell(6).value).toBe(2)
  expect(n.getCell(7).text).toBe('Biological replicates: 8 per group.')
  for (const sheet of book.worksheets) sheet.eachRow(r => r.eachCell(c => expect(c.type).not.toBe(ExcelJS.ValueType.Formula)))
  expect(book.getWorksheet('差异对照')!.getCell('C2').text).toContain('可比性待核对')
  const report = readFileSync(join(directory, '文献总结.md'), 'utf8')
  expect(report).toContain('P1-E3')
  expect(report).toContain('PDF 物理页 2')
  expect(report).toContain('未提供')
  expect(report).toContain('文本不可提取')
  expect(files.map(f => createHash('sha256').update(readFileSync(join(workspace, 'papers', f))).digest('hex'))).toEqual(hashes)
  for (const f of ['论文对照.xlsx', '文献总结.md']) copyFileSync(join(directory, f), info.outputPath(f))
  const artifacts = page.getByRole('group', {name: '本轮生成的文件'}).last()
  await expect(artifacts).toContainText('已生成 2 个文件')
  await artifacts.getByRole('button', {name: '展开文件列表', exact: true}).click()
  await artifacts.getByRole('button', {name: /文献总结\.md$/}).click()
  await expect(page.locator('.right-dock .preview')).toContainText('PDF 物理页 2')
  await page.screenshot({path: info.outputPath('literature-review-flow.png')})
})

test('只讨论不读取、导出或启动额外执行', async ({dawn}) => {
  await 在项目里开会话(dawn.page)
  await send(dawn.page, '文献对照验收，只讨论如何比较，不读写文件。')
  await expect(dawn.page.locator('.turn.agent').last()).toContainText('未读取或写入文件')
  expect(existsSync(join(dawn.workspace, 'outputs/literature-review'))).toBe(false)
  expect(JSON.stringify(dawn.requests)).not.toContain('"tool_calls"')
})

test('PDF 族关闭时明确告知，保持关闭且不借其他工具执行', async ({dawn}) => {
  await 进设置(dawn.page, '插件')
  const off = dawn.page.getByRole('checkbox', {name: '启用 PDF 工具', exact: true})
  await off.uncheck()
  await dawn.page.getByRole('button', {name: '返回', exact: true}).click()
  await 在项目里开会话(dawn.page)
  await send(dawn.page, '文献对照验收，请比较论文。')
  await expect(dawn.page.locator('.turn.agent').last()).toContainText('工具不可用：pdf_read')
  expect(existsSync(join(dawn.workspace, 'outputs/literature-review'))).toBe(false)
  expect(JSON.stringify(dawn.requests)).not.toContain('"tool_calls"')
  await 进设置(dawn.page, '插件')
  await expect(dawn.page.getByRole('checkbox', {name: '启用 PDF 工具', exact: true})).not.toBeChecked()
})

test('实际 PDF 读取失败，停止且不生成看似完整的表格', async ({dawn}) => {
  await 在项目里开会话(dawn.page)
  await send(dawn.page, '文献对照验收，输入 PDF 不存在。')
  await expect(dawn.page.locator('.turn.agent').last()).toContainText('文献对照未完成')
  expect(existsSync(join(dawn.workspace, 'outputs/literature-review'))).toBe(false)
})
