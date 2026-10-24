import { stripVTControlCharacters } from 'node:util'

/** Model/tool text is data, never terminal escape instructions. */
export const plain = (text: string) => stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
export function toolDetail(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const fields = input as Record<string, unknown>
  for (const name of ['command', 'path', 'code', 'query']) {
    if (typeof fields[name] === 'string') return plain(fields[name]).split('\n').slice(0, 3).join('\n').slice(0, 600)
  }
  return ''
}
export const CLI_HELP = `DAWN Science · 命令行 Agent

  dawn                    在当前目录进入 Agent
  dawn --agent <名称>      选择配置中的本地 API Agent
  dawn --resume [会话ID]   选择或恢复当前目录中的历史会话（连接桌面）
  dawn --help              查看帮助
  dawn agents              列出配置中的 Agent

Agent 中：
  /exit                   退出并回到原 Shell（Normal）
  /help                   帮助
  /status                 当前模型、目录和记录位置
  Enter                   发送当前输入
  Shift/Alt+Enter          换行（内置终端支持 Shift+Enter）
  ↑ / ↓                   编辑或浏览输入历史
  Ctrl-Shift-F            搜索当前记录；Enter 下一个，Shift-Enter 上一个，Esc 关闭
  Ctrl-R                  搜索输入历史；Enter 填入草稿，Esc 取消
  Tab                     空输入时采纳建议；否则展开 / 收起工具详情（斜杠命令正常补全）
  →                       空输入时采纳建议
  PgUp / PgDn             浏览会话记录；End 回到底部
  Ctrl-L                  刷新当前终端界面
  Ctrl-C                  执行时停止；空闲先清草稿，再退出

DAWN 内启动会复用已配置的模型与凭证。
独立运行可使用标准 API key 环境变量，或 DAWN_API_KEY。
DAWN_CONFIG 指定配置；DAWN_CLI_HOME 指定独立 CLI 数据目录。
`
