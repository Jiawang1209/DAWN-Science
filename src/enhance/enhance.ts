/**
 * 提示词增强的编排（E2–E4）：把三档串起来。
 *
 *   基础：调一次。
 *   标准：对话切三窗 → 逐窗判定命中即止 → 带那一窗调一次。
 *   专家：标准 + 开发意图判定 → 工作区 `.md` 候选（关键词打分 + 一手片段）→ 挑文档 →
 *         有项目地图再扫代码 → 调一次。
 *
 * **依赖全注入**：问模型、读对话、列文件、读文件——单测用假的，e2e 用真的。
 * **检索任何一步失败都降级为不带，但要说出来**（`note`）：不静默退化成基础档（规格 7.5）。
 */
import { 参考块标题, 拼system, 拼user, type 档 } from "./prompts.js"
import { 清洗 } from "./clean.js"
import { 抽关键词, 找相关的对话, 有开发意图, 按关键词排文件, 取片段, 挑文档, 代码文件, 该跳过, type 一句, type 问一句 } from "./retrieve.js"

export interface EnhanceDeps {
  /** 改写那一问（大的）与判定那几问（小的）都走它 */
  问: 问一句
  /** 这段会话的对话历史（只要人话：user / agent 的最终 turn） */
  历史: () => Promise<readonly 一句[]>
  /** 工作区里的文件（相对路径），按后缀过滤；没有工作区就回空 */
  列文件: (后缀: RegExp, 最深: number) => Promise<readonly string[]>
  读文件: (path: string) => Promise<string>
  进度?: (阶段: string) => void
  signal?: AbortSignal
}

export interface EnhanceResult {
  text: string
  /** 带了什么参考；什么都没带 = null */
  usedContext: { rounds?: [number, number]; docs?: string[]; code?: string[] } | null
  /** 检索没带上的原因（有参考可带却失败 / 没命中）；没有就 undefined */
  note?: string
}

const 文档最多 = 5
const 文档最深 = 3
const 代码最多 = 3
const 对话上限字 = 2400
const 改写maxTokens: Record<档, number> = { basic: 2000, standard: 3000, expert: 4000 }

export async function 增强(text: string, 档: 档, deps: EnhanceDeps): Promise<EnhanceResult> {
  const 原 = text.trim()
  if (!原) throw new Error("草稿是空的，先写点什么")
  const 参考块: string[] = []
  const used: NonNullable<EnhanceResult["usedContext"]> = {}
  const notes: string[] = []
  const 问 = deps.问
  const signal = deps.signal

  if (档 !== "basic") {
    deps.进度?.("读对话")
    let 历史: readonly 一句[] = []
    try {
      历史 = await deps.历史()
    } catch (e) {
      notes.push(`读不到对话历史：${e instanceof Error ? e.message : String(e)}`)
    }
    if (历史.length > 0) {
      let n = 0
      const 命中 = await 找相关的对话(历史, 原, 问, {
        上限字数: 对话上限字,
        ...(signal ? { signal } : {}),
        进度: (i, 总) => {
          n = 总
          deps.进度?.(`判定相关 ${i}/${总}`)
        },
      })
      if (命中) {
        参考块.push(`${参考块标题.对话}\n${命中.文本}`)
        used.rounds = 命中.窗
      } else if (n > 0) notes.push("对话里没有相关的轮次")
    }
  }

  if (档 === "expert") {
    deps.进度?.("判定意图")
    const 背景 = used.rounds ? (参考块[0] ?? "") : ""
    const 开发 = await 有开发意图(原, 背景, 问, signal)
    if (!开发) notes.push("不像开发任务，没扫工作区")
    else {
      try {
        deps.进度?.("扫文档")
        const 关键词 = 抽关键词(原)
        const md = (await deps.列文件(/\.md$/i, 文档最深)).filter((p) => !该跳过(p))
        // 根目录的 README 永远是候选：项目地图多半在它里面；内容命不中关键词时 `取片段` 会把它筛掉
        const 根README = md.filter((p) => /^readme(\..*)?\.md$/i.test(p))
        const 候选路径 = [...new Set([...按关键词排文件(md, 关键词, 文档最多), ...根README])].slice(0, 文档最多 + 1)
        const 候选 = (
          await Promise.all(
            候选路径.map(async (p) => {
              try {
                const 片段 = 取片段(await deps.读文件(p), 关键词)
                return 片段 ? { path: p, 片段 } : undefined
              } catch {
                return undefined
              }
            }),
          )
        ).filter((x): x is { path: string; 片段: string } => Boolean(x))
        if (候选.length === 0) notes.push(关键词.length ? `工作区里没有命中「${关键词.slice(0, 3).join("、")}」的文档` : "草稿里抽不出关键词，没扫工作区")
        else {
          deps.进度?.("挑文档")
          const { 选中, codePaths } = await 挑文档(候选, 原, 问, signal)
          if (选中.length === 0) notes.push("候选文档都不相关")
          else {
            参考块.push(`${参考块标题.文档}\n${选中.map((c) => `📄 ${c.path}\n${c.片段}`).join("\n\n")}`)
            used.docs = 选中.map((c) => c.path)
            if (codePaths.length > 0) {
              deps.进度?.("扫代码")
              const 代码 = (await deps.列文件(代码文件, 文档最深 + 1)).filter((p) => !该跳过(p))
              // 项目地图指的目录优先
              const 排 = 按关键词排文件(代码, 关键词, 代码最多 * 3)
              const 前 = [...排.filter((p) => codePaths.some((c) => p.startsWith(c))), ...排.filter((p) => !codePaths.some((c) => p.startsWith(c)))].slice(0, 代码最多)
              const 片段们 = (
                await Promise.all(
                  前.map(async (p) => {
                    try {
                      const 片 = 取片段(await deps.读文件(p), 关键词)
                      return 片 ? `📄 ${p}\n${片}` : undefined
                    } catch {
                      return undefined
                    }
                  }),
                )
              ).filter(Boolean) as string[]
              if (片段们.length > 0) {
                参考块.push(`${参考块标题.代码}\n${片段们.join("\n\n")}`)
                used.code = 前.slice(0, 片段们.length)
              }
            }
          }
        }
      } catch (e) {
        notes.push(`扫工作区失败：${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  deps.进度?.("改写中")
  const 答 = await 问({
    system: 拼system(参考块.length > 0),
    user: 拼user(原, 参考块),
    maxTokens: 改写maxTokens[档],
    ...(signal ? { signal } : {}),
  })
  const 净 = 清洗(答)
  if (!净) throw new Error("模型什么都没给")
  return {
    text: 净,
    usedContext: Object.keys(used).length > 0 ? used : null,
    ...(notes.length > 0 && 档 !== "basic" ? { note: notes.join("；") } : {}),
  }
}
