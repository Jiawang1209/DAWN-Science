import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react"
import { ComposerInputSurface, useComposerCallback } from "../../src/ui/composer-input-surface.js"

afterEach(cleanup)

it("keeps action identity while invoking the latest committed callback and return value", () => {
  const first = vi.fn((value: string) => `old:${value}`)
  const next = vi.fn((value: string) => `new:${value}`)
  const { result, rerender } = renderHook(({ action }) => useComposerCallback(action), { initialProps: { action: first } })
  const stable = result.current
  rerender({ action: next })
  expect(result.current).toBe(stable)
  expect(stable("question")).toBe("new:question")
  expect(first).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledWith("question")
})

it("keeps optional actions absent until supported and removes them again", () => {
  const action = vi.fn()
  const initialProps: { action: (() => void) | undefined } = { action: undefined }
  const { result, rerender } = renderHook(({ action }) => useComposerCallback(action), { initialProps })
  expect(result.current).toBeUndefined()
  rerender({ action })
  result.current!()
  expect(action).toHaveBeenCalledOnce()
  rerender({ action: undefined })
  expect(result.current).toBeUndefined()
})

it("updates actions behind a memoized input without re-rendering its children", () => {
  const painted = vi.fn()
  const oldAction = vi.fn()
  const nextAction = vi.fn()
  function Input({ action }: { action: () => void }) { painted(); return <button onClick={action}>send</button> }
  function View({ action }: { action: () => void }) {
    const stable = useComposerCallback(action)
    return <ComposerInputSurface fingerprint={["session", stable]}><Input action={stable} /></ComposerInputSurface>
  }
  const view = render(<View action={oldAction} />)
  view.rerender(<View action={nextAction} />)
  expect(painted).toHaveBeenCalledOnce()
  fireEvent.click(view.getByRole("button", { name: "send" }))
  expect(oldAction).not.toHaveBeenCalled()
  expect(nextAction).toHaveBeenCalledOnce()
})
