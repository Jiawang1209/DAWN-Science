/**
 * **到坞里问**（调整方向，2026-09-25，spec §2）的那几步，抽成一个不碰 React、不碰 IPC 的流程
 * （Task 6 审查：失败路径的顺序靠 e2e 夹具去逼太贵，单测几毫秒就能把整张失败表走一遍）。
 *
 * 顺序：主区待发单上拿走这句（原文 + 原图）→ 坞里「另开一段」→ 坞打开到「对话」
 * → 先取新那段的写权（计划风险 7：坞格的续租是个 effect，挂上那一拍未必已经取到）→ 这句接在继承的历史后发出去。
 *
 * **失败的规矩**（规格 7.5：失败出声、不丢）：
 *   - 拿走之后任何一步失败，这句（连图）放回**主区那段**的输入框；
 *   - 失败**只说一种话**，并且**一定经 `说`（全局提示）说一遍**——人在等的那一下切走了会话，
 *     发起的那条待发条已经卸掉，它的 `onError` 说给谁也听不见（审查 m-1）；
 *     同一句也抛给待发条，人还在原处时条上也看得见；
 *   - 没处另开：`另开` 抛出的就是真正的原因，原样转述，不再另加一句含糊的（审查 m-2）；
 *   - 新那段已经开出来、挂进坞了才失败的：**它留在坞里**（那是一段能用的空对话，侧栏里也有），
 *     但要说明白坞里那段是空的（审查 m-3）。
 */
import { t, tf } from "../i18n/index.js"
import type { 退回的图 } from "./view.js"

export type 撤回的话 = { text: string; images?: readonly 退回的图[] }

export interface 到坞里问的依赖 {
  /** 从主区待发单上拿走这句（`editQueue remove`）；拿不到回 undefined */
  取回: () => Promise<撤回的话 | undefined>
  /** 坞里另开一段并挂上，回新那段的 id；**开不成就抛，message 是真正的原因** */
  另开: () => Promise<string>
  /** 开坞、切到「对话」那一格 */
  打开: () => void
  取写权: (id: string) => Promise<unknown>
  写: (id: string, text: string, images?: readonly 退回的图[]) => Promise<void>
  /** 放回主区那段的输入框 */
  退回: (话: 撤回的话) => void
  /** 全局提示（`note`）：换了会话也还在 */
  说: (message: string) => void
  /** 发出去之后（重取会话列表，让侧栏那一行的标题跟上这句新问题） */
  发完?: () => void
}

export async function 到坞里问(dep: 到坞里问的依赖): Promise<void> {
  const 话 = await dep.取回()
  // 实际上 remove 找不到会抛 not_found；万一回了空，也不静默走掉（审查 m-4）
  if (!话) throw new Error(t("这条已经不在待发单上了——多半刚好送出去了"))
  let 新: string | undefined
  try {
    新 = await dep.另开()
    dep.打开()
    await dep.取写权(新)
    await dep.写(新, 话.text, 话.images)
  } catch (e) {
    dep.退回(话)
    const 因 = e instanceof Error ? e.message : String(e)
    const 这句 = 新
      ? tf("这句没能到坞里问，已放回输入框；坞里新开的那段还空着：{0}", 因)
      : tf("这句没能到坞里问，已放回输入框：{0}", 因)
    dep.说(这句)
    throw new Error(这句)
  }
  dep.发完?.()
}
