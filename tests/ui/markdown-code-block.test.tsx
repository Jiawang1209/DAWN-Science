import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { AgentMarkdown } from "../../src/ui/markdown.js"

const NativeIntersectionObserver = globalThis.IntersectionObserver

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  readonly observed = new Set<Element>()
  readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  observe(element: Element) { this.observed.add(element) }
  unobserve(element: Element) { this.observed.delete(element) }
  disconnect() { this.observed.clear() }
  takeRecords(): IntersectionObserverEntry[] { return [] }
  get root(): Element | Document | null { return null }
  get rootMargin(): string { return "0px" }
  get thresholds(): number[] { return [0] }

  revealAll() {
    this.callback(
      [...this.observed].map((target) => ({
        target,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
        time: 0,
      })),
      this as unknown as IntersectionObserver,
    )
  }
}

afterEach(() => {
  cleanup()
  FakeIntersectionObserver.instances = []
  if (NativeIntersectionObserver) globalThis.IntersectionObserver = NativeIntersectionObserver
  else Reflect.deleteProperty(globalThis, "IntersectionObserver")
})

describe("transcript code block highlighting", () => {
  it("waits for the turn and visibility, uses one observer, and keeps copy controls available", () => {
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver
    const text = "```ts\nconst first = 1\n```\n\n```python\nsecond = 2\n```"
    const view = render(<AgentMarkdown text={text} streaming />)

    expect(FakeIntersectionObserver.instances).toHaveLength(1)
    expect(FakeIntersectionObserver.instances[0]!.observed.size).toBe(2)
    expect(view.container.querySelectorAll('[data-code-highlighted="false"]')).toHaveLength(2)
    expect(view.container.querySelectorAll('[data-streamdown="code-block-actions"] button').length).toBeGreaterThanOrEqual(4)

    act(() => FakeIntersectionObserver.instances[0]!.revealAll())
    expect(view.container.querySelectorAll('[data-code-highlighted="false"]')).toHaveLength(2)
    expect(view.container.querySelectorAll('[data-code-highlighted="false"]')).toHaveLength(2)

    view.rerender(<AgentMarkdown text={text} streaming={false} />)
    expect(view.container.querySelectorAll('[data-code-highlighted="true"]')).toHaveLength(2)
    expect(view.container.querySelectorAll('[data-streamdown="code-block-actions"] button').length).toBeGreaterThanOrEqual(4)
  })
})
