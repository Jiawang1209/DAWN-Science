/**
 * 所有 transcript 代码块共用一个 IntersectionObserver。
 * 每个代码块第一次进入视口后解除观察，之后不会再占用观察器回调。
 */
const callbacks = new Map<Element, () => void>()
let observer: IntersectionObserver | undefined

function getObserver(): IntersectionObserver | undefined {
  if (typeof IntersectionObserver === "undefined") return undefined
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const onVisible = callbacks.get(entry.target)
        if (!onVisible) continue
        callbacks.delete(entry.target)
        observer?.unobserve(entry.target)
        onVisible()
      }
    })
  }
  return observer
}

/**
 * 观察一次进入视口；没有 IntersectionObserver 的旧环境直接视为可见，不能因此丢高亮。
 * 返回的清理函数可安全重复调用。
 */
export function observeCodeBlockVisibility(element: Element, onVisible: () => void): () => void {
  const sharedObserver = getObserver()
  if (!sharedObserver) {
    onVisible()
    return () => {}
  }
  callbacks.set(element, onVisible)
  sharedObserver.observe(element)
  return () => {
    callbacks.delete(element)
    sharedObserver.unobserve(element)
  }
}
