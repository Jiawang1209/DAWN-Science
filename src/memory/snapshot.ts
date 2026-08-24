/**
 * 记忆快照渲染(2026-08-25,规格 §三)。
 *
 * 建会话时拼进系统提示词(`native.ts` 的 `appendSystemPromptOverride`)——
 * **确认的记忆下一段会话生效**,与「插件开关下一段会话生效」同一条契约。
 *
 * 段序:用户档案 → 全局事实 → 本项目关键记忆(按当前 git 分支过滤,
 * 分支名一并注入)→ **固定文本**的提议职责。职责段是固定文本:
 * 它不随内容变化,变的只有前三段——与 dsh「提示行本身是固定文本」同一条。
 *
 * 全空回空串:没有记忆就一个字都不注入,不摆空架子。
 */
import { parseEntryBranches, stripEntryId, type MemoryStore } from "./store.js"

const 职责段 = [
  "## 长期记忆的规矩",
  "上面几段是用户确认过的长期记忆(用户档案 / 全局事实 / 本项目关键记忆),直接照着用,不必再问。",
  "对话中出现**长期有效**的重要事实(项目约定、口径决策、架构、踩坑结论)时,用 memory_propose 提议记下来——它进待确认队列,用户采纳后下一段会话生效;不要自己写时间戳(程序会盖)。流水进展不算,别拿它当日志。",
  "一套做过的流程值得复用时,用 skill_propose 把它写成技能提交(同样等用户批准)。",
].join("\n")

/** 剥 [id:] 后按行列出(身份证是内部锚点,不进模型上下文)。 */
const 列出 = (entries: string[]) => entries.map((e) => `- ${stripEntryId(e)}`).join("\n")

export function 渲染快照(
  store: MemoryStore,
  workspace: string | undefined,
  branch: string | undefined,
): string {
  const 段: string[] = []
  const user = store.entries("user")
  if (user.length > 0) 段.push(`## 用户档案(用户确认过的长期记忆)\n${列出(user)}`)
  const memory = store.entries("memory")
  if (memory.length > 0) 段.push(`## 全局事实(用户确认过的长期记忆)\n${列出(memory)}`)
  if (workspace) {
    let key = store.entries("key", { workspace })
    if (branch !== undefined) {
      // 无标记 = 全部分支;有标记只在覆盖当前分支时注入。
      // 非 git / 拿不到分支(branch === undefined)→ 不过滤——保守选择,绝不藏记忆
      key = key.filter((e) => {
        const scope = parseEntryBranches(e)
        return scope === null || scope.includes(branch)
      })
    }
    if (key.length > 0) {
      const 头 =
        branch !== undefined
          ? `## 本项目关键记忆(当前 git 分支:${branch};只列了这个分支可见的)`
          : "## 本项目关键记忆"
      段.push(`${头}\n${列出(key)}`)
    }
  }
  if (段.length === 0) return ""
  段.push(职责段)
  return 段.join("\n\n")
}
