import { useEffect, useRef, useState } from "react"

/** Per-mounted composer cache. Request identity protects reused views and late replies. */
export function useNextPrompt(key: string, enabled: boolean, load?: ((turnId: string) => Promise<{ text: string }>) | undefined, turnId = "") {
  const loader = useRef(load)
  loader.current = load
  const cache = useRef(new Map<string, Promise<string>>())
  const [result, setResult] = useState({ key: "", text: "" })
  const available = !!load
  useEffect(() => {
    if (!enabled || !available || !turnId) return
    let active = true
    const timer = setTimeout(() => {
      let request = cache.current.get(key)
      if (!request) {
        request = loader.current!(turnId).then((r) => r.text, () => "")
        cache.current.set(key, request)
        if (cache.current.size > 30) cache.current.delete(cache.current.keys().next().value!)
      }
      void request.then((text) => { if (active) setResult({ key, text }) })
    }, 400)
    return () => { active = false; clearTimeout(timer) }
  }, [key, turnId, enabled, available])
  return enabled && result.key === key ? result.text : ""
}
