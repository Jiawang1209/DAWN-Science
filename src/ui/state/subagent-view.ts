/**
 * 坞里「子 agent」那一格正在看的那个（2026-09-27，spec §4.5）。**渲染进程自有、不持久化**：
 * 它是一次点击的余波，与 `$待开网址` 同一类——存下来的话重启之后会莫名其妙自己打开上次那一个。
 *
 * 它的转录是**第三个槽**：主槽、侧槽、子槽，攒的逻辑只此一份（`创建转录槽`）。后端权威，这里是缓存。
 */
import { atom } from "nanostores"
import type { SubagentInfo } from "../../protocol/index.js"
import { 创建转录槽 } from "./transcript-slot.js"

export const $子转录id = atom<string | undefined>(undefined)
export const 子槽 = 创建转录槽()
/** 头信息（谁、状态、交回的结果、能不能问）。缺省 = 还没取到 */
export const $子agent信息 = atom<SubagentInfo | undefined>(undefined)
