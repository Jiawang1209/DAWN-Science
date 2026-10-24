import { createInterface } from 'node:readline/promises'
import type { CliHistoryEntry } from './desktop-wire.js'
import { plain } from './presentation.js'
export class ResumeCancelled extends Error {}
export async function chooseCliHistory(entries: readonly CliHistoryEntry[]): Promise<string> {
  if (!entries.length) throw new Error('当前目录没有可恢复的历史会话')
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('非交互输入请使用 dawn --resume <完整会话ID>')
  const controller = new AbortController(), cancel = () => controller.abort()
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  process.on('SIGINT', cancel); rl.on('SIGINT', cancel)
  try {
    process.stdout.write('\n选择历史会话（回车取消）：\n')
    entries.forEach((entry, i) => process.stdout.write(`  ${i + 1}. ${plain(entry.title ?? '新会话').slice(0, 100)} · ${entry.sessionId.slice(0, 8)}\n`))
    while (true) {
      const answer = (await rl.question('编号 > ', { signal: controller.signal })).trim()
      if (!answer) throw new ResumeCancelled()
      if (/^\d+$/.test(answer) && entries[Number(answer) - 1]) return entries[Number(answer) - 1]!.sessionId
      process.stdout.write('请输入列表中的有效编号，或直接回车取消。\n')
    }
  } catch (error) { if (controller.signal.aborted) throw new ResumeCancelled(); throw error }
  finally { rl.close(); process.removeListener('SIGINT', cancel) }
}
