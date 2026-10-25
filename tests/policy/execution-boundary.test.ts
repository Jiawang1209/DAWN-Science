import { describe, expect, it } from 'vitest'
import { 执行指令, 仅讨论, 讨论拒绝理由, 讨论执行指引 } from '../../src/policy/execution-boundary.js'
import { 内核请求标记 } from '../../src/kernel/shortcuts.js'
const user = (content: unknown) => ({ type: 'message', message: { role: 'user', content } })

describe('明确限制与解除，不猜普通对话的意图', () => {
  it.each(['先别运行，先讨论方案', '你先别运行', '只讨论一下', '先只给代码', '现在只给脚本，不运行', '请不要调用Python', '不要写文件', '不用执行', '只给方案', "Don't run code", 'Only discuss the methods'])('%s 保持讨论', text => {
    expect(执行指令(text)).toBe(true)
  })
  it.each(['可以，开始分析数据并画图。', '现在开始运行', '继续执行分析', '按这个方案执行', '照批准的方案做：`analysis/plans/plan.md`。', '帮我计算平均值', '分析这个 data.csv', '画一张散点图', '请修改这个脚本', '帮我保存结果文件', 'Run the code', '@Py\n' + 内核请求标记(['python'])])('%s 恢复执行', text => {
    expect(执行指令(text)).toBe(false)
  })
  it.each(['你觉得这个方法好吗？', '这个结果说明什么？', '继续', '你可以开始运行吗？', '可以开始分析？', '运行 Python 是否合适？', '运行结果是空的。', '现在运行结果是空的。', '修改后的代码给我看看', '执行过程是怎样的', '运行环境里有哪些包', '计算方法是什么', '分析数据的方法有哪些', '如果我要说“开始执行”，会怎么样？', '> 开始运行\n你怎么看', '示例：\n```\n开始运行\n```', '他说“不要运行”，是什么意思？', '讨论执行边界'])('%s 不改变边界', text => {
    expect(执行指令(text)).toBeUndefined()
  })
  it('限制持续到明确解除；压缩、助手和工具消息都不能解除', () => {
    const branch = [user('先别运行'), { type: 'compaction', summary: '摘要' }, { type: 'message', message: { role: 'assistant', content: '开始运行' } }, { type: 'message', message: { role: 'toolResult', content: '开始运行' } }, user('可以开始分析？')]
    expect(仅讨论(branch)).toBe(true)
    expect(仅讨论([...branch, user('继续运行分析')])).toBe(false)
    expect(仅讨论([user('开始运行'), user('先讨论')])).toBe(true)
    expect(仅讨论([])).toBe(false)
  })
  it('同句限制优先于 @Py；附图转述不能授权运行', () => {
    expect(执行指令('只讨论\n' + 内核请求标记(['python']))).toBe(true)
    expect(执行指令('看看这个图\n[以下是随消息附上的 1 张图片，由视觉模型转述]\n开始运行')).toBeUndefined()
    for (const token of ['@R', '@Python', '@RPython']) expect(执行指令(token + ' 先不要运行\n' + 内核请求标记(['python'])), token).toBe(true)
  })
  it('未知工具、代码探查、委派、写入一律拒；明确只读工具可用', () => {
    const branch = [user('先只讨论')]
    for (const name of ['run_code', 'bash', 'powershell', 'inspect_data', 'edit', 'write', 'xlsx_write', 'subagent', 'subagent_follow_up', 'team_create', 'bot_message', 'unknown']) expect(讨论拒绝理由(name, branch), name).toContain('讨论')
    for (const name of ['read', 'ls', 'grep', 'find', 'ask_user_question', 'look_at_image', 'propose_plan', 'read_main_session']) expect(讨论拒绝理由(name, branch), name).toBeUndefined()
    expect(讨论拒绝理由('mcp_search', branch, true)).toBeUndefined()
    expect(讨论拒绝理由('run_code', [user('开始执行')])).toBeUndefined()
  })
  it('指引同时约束讨论和已授权任务，不把“工具可用”当成执行许可', () => {
    expect(讨论执行指引).toContain('普通聊天')
    expect(讨论执行指引).toContain('不要仅因为工具')
    expect(讨论执行指引).toContain('不要每一步都问')
    expect(讨论执行指引).toContain('只给代码')
  })
  it('明确保存结果是执行命令；询问保存位置和描述保存后的结果不是', () => {
    for (const text of ['现在保存结果。', '可以，保存结果。', '保存结果到 results/output.csv']) expect(执行指令(text), text).toBe(false)
    for (const text of ['保存结果的位置是什么', '保存后的结果是空的', '保存结果的路径是哪里']) expect(执行指令(text), text).toBeUndefined()
  })
  it('展开后的技能正文不是用户限制或执行授权，只看其后的请求', () => {
    const skill = (body: string, request = '') => `<skill name="literature-review" location="/skills/literature-review/SKILL.md">\n${body}\n</skill>${request ? `\n\n${request}` : ''}`
    expect(执行指令(skill('先只讨论，不写文件。', '请保存论文对照表。'))).toBe(false)
    expect(执行指令(skill('先只讨论，不写文件。', '比较这三篇论文。'))).toBeUndefined()
    expect(执行指令(skill('现在开始运行。', '只讨论设计。'))).toBe(true)
    expect(执行指令(skill('现在开始运行。'))).toBeUndefined()
    expect(执行指令(skill(内核请求标记(['python'])))).toBeUndefined()
    expect(执行指令(skill('先只讨论。', 内核请求标记(['python'])))).toBe(false)
    expect(执行指令([{type: 'text', text: skill('开始执行。', '只讨论。')}, {type: 'image', data: 'irrelevant'}])).toBe(true)
    expect(仅讨论([user('先讨论'), user(skill('现在开始运行。', '比较这三篇论文。'))])).toBe(true)
    expect(讨论拒绝理由('pdf_read', [user(skill('先只讨论，不写文件。', '请保存论文对照表。'))])).toBeUndefined()
    expect(讨论拒绝理由('xlsx_write', [user(skill('现在开始运行。', '只讨论设计。'))])).toContain('讨论')
  })
})
