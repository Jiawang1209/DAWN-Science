/**
 * 连接与出声。
 *
 * **权威在主进程**（它知道后端到底能不能用），渲染进程只是显示它。
 */
import { atom } from "nanostores"

/** 握手成功。**在此之前不要取数**——取了也只会拿到一串错误 */
export const $ready = atom(false)

/**
 * 致命错误：后端**完全不可用**。
 *
 * 只有这种情况才配得上占满全屏的启动失败界面。
 * Hermes：*"Reserve the full-screen boot/connecting experience for a genuinely
 * unusable backend."* 本项目此前把「没有项目」也做成了这种待遇——
 * 后端完全正常，界面却什么都不让做。
 */
export const $fatal = atom<string | undefined>(undefined)

/** 最近几条提示。规格 7.5：失败必须出声 */
export const $notes = atom<readonly string[]>([])

const MAX_NOTES = 4

/**
 * 记一条提示。
 *
 * **连续重复的同一条不刷屏**——一个每 200ms 重试一次的失败会在两秒内
 * 顶掉全部四条槽位，把真正有用的上下文挤走。
 */
export function note(message: string): void {
  const prev = $notes.get()
  if (prev.at(-1) === message) return
  $notes.set([...prev, message].slice(-MAX_NOTES))
}
