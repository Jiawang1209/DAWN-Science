import { act, renderHook, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { useDirectoryNavigation } from "../../src/ui/state/file-navigation.js"

const listing = (path: string) => ({ path, parentPath: path === "/" ? null : path.slice(0, path.lastIndexOf("/")) || "/", projectPath: "/work/project", entries: [], ignored: 0, omitted: 0 })

it("returns to the project when a remembered directory has disappeared", async () => {
  const load = vi.fn(async (path: string) => { if (path === "/removed") throw new Error("gone"); return listing(path || "/work/project") })
  const { result } = renderHook(() => useDirectoryNavigation({ identity: "saved", enabled: true, initialPath: "/removed", readDirectory: load }))
  await waitFor(() => expect(result.current.directory?.path).toBe("/work/project"))
})

it("validates navigation before committing history and keeps position on errors", async () => {
  const load = vi.fn(async (path: string) => { if (path === "/missing") throw new Error("missing"); return listing(path || "/work/project") })
  const changed = vi.fn()
  const { result } = renderHook(() => useDirectoryNavigation({ identity: "a", enabled: true, initialPath: "", readDirectory: load, onDirectory: changed }))
  await waitFor(() => expect(result.current.directory?.path).toBe("/work/project"))
  await act(async () => { await result.current.navigate("/work/sibling") })
  await act(async () => { await result.current.navigate("/missing") })
  expect(result.current.directory?.path).toBe("/work/sibling")
  expect(result.current.error).toContain("missing")
  await act(async () => { await result.current.back() })
  expect(result.current.directory?.path).toBe("/work/project")
  expect(result.current.canForward).toBe(true)
  await act(async () => { await result.current.forward() })
  expect(result.current.directory?.path).toBe("/work/sibling")
})

it("keeps the history cursor when clicking the current breadcrumb after going back", async () => {
  const { result } = renderHook(() => useDirectoryNavigation({ identity: "history", enabled: true, initialPath: "/a", readDirectory: async path => listing(path) }))
  await waitFor(() => expect(result.current.directory?.path).toBe("/a"))
  await act(async () => { await result.current.navigate("/b") })
  await act(async () => { await result.current.navigate("/c") })
  await act(async () => { await result.current.back() })
  await act(async () => { await result.current.navigate("/b") })
  expect(result.current.directory?.path).toBe("/b")
  expect(result.current.index).toBe(1)
  expect(result.current.canForward).toBe(true)
  await act(async () => { await result.current.back() })
  expect(result.current.directory?.path).toBe("/a")
})

it("ignores stale directory responses and isolates owner changes", async () => {
  let finish!: (value: ReturnType<typeof listing>) => void
  const load = vi.fn(async (path: string) => path === "/slow" ? new Promise<ReturnType<typeof listing>>(resolve => { finish = resolve }) : listing(path || "/work/project"))
  const { result, rerender } = renderHook(({ identity }) => useDirectoryNavigation({ identity, enabled: true, initialPath: "", readDirectory: load }), { initialProps: { identity: "a" } })
  await waitFor(() => expect(result.current.directory).toBeDefined())
  let slow!: Promise<boolean>
  act(() => { slow = result.current.navigate("/slow") })
  await act(async () => { await result.current.navigate("/fast") })
  await act(async () => { finish(listing("/slow")); await slow })
  expect(result.current.directory?.path).toBe("/fast")
  rerender({ identity: "b" })
  await waitFor(() => expect(result.current.directory?.path).toBe("/work/project"))
  expect(result.current.canBack).toBe(false)
})
