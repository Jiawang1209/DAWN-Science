import { useLayoutEffect, useRef } from "react"

/** 只动画当前内容，不保留退场副本、不延迟业务状态，也不重挂载设置表单。 */
export function useSettingsTransition(pageKey: string, mode: "column" | "page") {
  const ref = useRef<HTMLDivElement>(null)
  const previous = useRef(pageKey)
  useLayoutEffect(() => {
    const changed = previous.current !== pageKey
    previous.current = pageKey
    const element = ref.current
    if (!changed || !element || typeof element.animate !== "function") return
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (preference.matches) return
    const frames: Keyframe[] = mode === "column"
      ? [{ opacity: 0.55, transform: pageKey === "list" ? "translateX(-24px)" : "translateX(24px)" }, { opacity: 1, transform: "translateX(0)" }]
      : [{ opacity: 0.6 }, { opacity: 1 }]
    const animation = element.animate(frames, {
      duration: mode === "column" ? 220 : 140,
      easing: getComputedStyle(element).getPropertyValue("--dawn-ease").trim() || "ease-out",
    })
    const stop = () => { if (preference.matches) animation.cancel() }
    preference.addEventListener("change", stop)
    return () => {
      animation.cancel()
      preference.removeEventListener("change", stop)
    }
  }, [pageKey, mode])
  return ref
}
