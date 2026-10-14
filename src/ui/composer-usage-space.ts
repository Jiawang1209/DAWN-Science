import { useEffect, useState } from "react"
import { atom } from "nanostores"
import { useStore } from "@nanostores/react"

// 只同步当前可见输入卡下方的占位高度，不共享任何会话统计。
const heights = new Map<HTMLElement, number>()
const $height = atom(0)
const update = () => $height.set(Math.max(0, ...heights.values()))

/** 测量内容本身，避免把同步后的 min-height 再读回来形成反馈。 */
export function useComposerUsageSpace() {
  const [el, ref] = useState<HTMLElement | null>(null)
  const height = useStore($height)
  useEffect(() => {
    if (!el) return
    const measure = () => {
      heights.set(el, Math.ceil(el.getBoundingClientRect().height))
      update()
    }
    measure()
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure)
    observer?.observe(el)
    return () => {
      observer?.disconnect()
      heights.delete(el)
      update()
    }
  }, [el])
  return { ref, height }
}
