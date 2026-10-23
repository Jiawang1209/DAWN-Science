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
  dawn --help              查看帮助
  dawn agents              列出配置中的 Agent

Agent 中：
  /exit                   退出并回到原 Shell（Normal）
  /help                   帮助
  /status                 当前模型、目录和记录位置
  Ctrl-C                  执行时停止，空闲时退出

凭证：标准 API key 环境变量，或 DAWN_API_KEY。
DAWN_CONFIG 指定配置；DAWN_CLI_HOME 指定独立 CLI 数据目录。
`
