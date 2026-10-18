import { describe, expect, it, vi } from "vitest"
import {
  RouteController,
  displayRouteMessage,
  resolveRouteFile,
  performRouteAction,
} from "../../src/ui/state/analysis-route.js"
import { routeActionMessage } from "../../src/protocol/analysis-route.js"
import { route } from "./analysis-route-fixture.js"
describe("route ownership and action boundary", () => {
  it("rejects late reads across sessions, re-entry and request generations", () => {
    const c = new RouteController()
    c.activate("a")
    const old = c.begin()
    c.activate("b")
    expect(c.accept(old, { supported: true, route: route() })).toBe(false)
    c.activate("a")
    const first = c.begin()
    const second = c.begin()
    expect(c.accept(old, { supported: true, route: route() })).toBe(false)
    expect(c.accept(first, { supported: true, route: route() })).toBe(false)
    expect(c.accept(second, { supported: true, route: route(2) })).toBe(true)
  })
  it("invalidates action ownership when leaving and re-entering the same session", () => {
    const c = new RouteController()
    c.activate("a")
    const active = c.captureOwner()
    c.activate("b")
    c.activate("a")
    expect(active()).toBe(false)
  })
  it("does not let an old get overwrite a newer event revision or its evidence", () => {
    const c = new RouteController()
    c.activate("a")
    const ticket = c.begin()
    c.receive("a", route(3))
    expect(c.accept(ticket, { supported: true, route: route(2), evidence: { tools: [], deliverables: [] } })).toBe(
      false,
    )
    expect(c.$state.get().result?.route?.revision).toBe(3)
  })
  it("retains already loaded history across newer route events", () => {
    const c = new RouteController()
    c.activate("a")
    c.accept(c.begin(), { supported: true, route: route(2), history: [route(1)] })
    c.receive("a", route(3))
    expect(c.$state.get().result?.history?.[0]?.revision).toBe(1)
  })
  it("surfaces the latest read error while retaining the route and history, then clears it on success", () => {
    const c = new RouteController()
    c.activate("a")
    const cached = { supported: true, route: route(2), history: [route(1)] }
    c.accept(c.begin(), cached)
    const error = { code: "ROUTE_ERROR", message: "history unreadable" }
    expect(c.accept(c.begin(), { supported: true, error })).toBe(true)
    expect(c.$state.get().result).toEqual({ ...cached, error })
    expect(c.accept(c.begin(), cached)).toBe(true)
    expect(c.$state.get().result?.error).toBeUndefined()
  })
  it("does not surface late read errors from an old request or another session", () => {
    const c = new RouteController()
    c.activate("a")
    c.accept(c.begin(), { supported: true, route: route(2) })
    const old = c.begin()
    const latest = c.begin()
    const failure = { supported: true, error: { code: "ROUTE_ERROR", message: "late error" } }
    expect(c.accept(old, failure)).toBe(false)
    expect(c.$state.get().result?.error).toBeUndefined()
    c.activate("b")
    expect(c.accept(latest, failure)).toBe(false)
    expect(c.$state.get().result).toBeUndefined()
  })
  it("hides valid marker-only messages without a newline", () => {
    expect(displayRouteMessage(routeActionMessage(route(), "S1", "view").split("\n")[0]!)).not.toContain(
      "analysis_route_action",
    )
  })
  it("keeps step identity visible while hiding valid internal marker JSON", () => {
    const message = routeActionMessage(route(), "S1", "view")
    expect(displayRouteMessage(message)).toContain("S1")
    expect(displayRouteMessage(message)).toContain("请解释")
    expect(displayRouteMessage(message)).not.toContain("[analysis_route_action]")
    expect(displayRouteMessage("普通消息")).toBe("普通消息")
  })
  it("resolves remote outputs only with a real absolute remote workspace", () => {
    expect(resolveRouteFile("results/a.md", true, "/srv/project")).toBe("/srv/project/results/a.md")
    expect(resolveRouteFile("results/a.md", false)).toBe("results/a.md")
    for (const path of ["../key", "/etc/passwd", "https://host/file", "a/./b", "a\\b"])
      expect(() => resolveRouteFile(path, false)).toThrow()
    expect(() => resolveRouteFile("results/a.md", true)).toThrow()
  })
  it("metadata selection never sends a model message even if a backend returns one", async () => {
    const send = vi.fn()
    const echo = vi.fn()
    await performRouteAction({
      action: "select",
      request: async () => ({ route: route(), message: "unexpected" }),
      active: () => true,
      send,
      echo,
      receive: vi.fn(),
    })
    expect(send).not.toHaveBeenCalled()
    expect(echo).not.toHaveBeenCalled()
  })
  it("late action after a session switch cannot echo or send", async () => {
    let active = true
    const send = vi.fn()
    const receive = vi.fn()
    await expect(
      performRouteAction({
        action: "view",
        request: async () => {
          active = false
          return { message: "request" }
        },
        active: () => active,
        send,
        receive,
      }),
    ).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    expect(receive).not.toHaveBeenCalled()
  })
  it("send failure removes the local echo and remains retryable", async () => {
    const undo = vi.fn()
    await expect(
      performRouteAction({
        action: "continue",
        request: async () => ({ message: "request" }),
        active: () => true,
        send: async () => {
          throw Error("LEASE_CONFLICT")
        },
        echo: () => undo,
        receive: vi.fn(),
      }),
    ).rejects.toThrow("LEASE_CONFLICT")
    expect(undo).toHaveBeenCalledOnce()
  })
})

it("localizes mechanical blockers in English while retaining authored conditions", async () => {
  const { $lang } = await import("../../src/ui/i18n/index.js")
  const { localizedRouteBlockers } = await import("../../src/ui/state/analysis-route.js")
  const r = route()
  r.steps.push({ ...r.steps[0]!, id: "S2", dependencies: ["S1"], blockers: ["用户条件原文"], needsReview: true })
  $lang.set("en")
  try {
    const text = localizedRouteBlockers(r, "S2").join(" ")
    expect(text).toContain("用户条件原文")
    expect(text.replace("用户条件原文", "")).not.toMatch(/[\u3400-\u9fff]/)
    expect(displayRouteMessage(routeActionMessage(r, "S1", "view")).split("\n")[0]).toMatch(/Explain step S1/)
  } finally {
    $lang.set("zh")
  }
})
