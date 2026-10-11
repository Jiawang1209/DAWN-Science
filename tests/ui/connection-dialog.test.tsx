import { expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ConnectionDialog } from "../../src/ui/remote.js"
const draft = { label: "生态服务器", host: "example.org", username: "researcher", hasSecret: false }
it("新增用保存并连接，失败取得ID后仍保持新增意图", () => {
  const save = vi.fn()
  render(<ConnectionDialog draft={{ ...draft, id: "saved-id" }} connectAfterSave onSave={save} onCancel={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "保存并连接" }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "saved-id" }))
})
it("编辑只保存；未改口令不发送secret", () => {
  const save = vi.fn()
  render(<ConnectionDialog draft={{ ...draft, id: "s1", hasSecret: true }} onSave={save} onCancel={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save.mock.calls[0]?.[0].secret).toBeUndefined()
})
it("无效端口不能提交", () => {
  render(<ConnectionDialog draft={{ ...draft, port: 70000 }} connectAfterSave onSave={vi.fn()} onCancel={vi.fn()} />)
  expect((screen.getByRole("button", { name: "保存并连接" }) as HTMLButtonElement).disabled).toBe(true)
})
it("认证切换清除旧模式凭证，不复用私钥口令作密码", () => {
  const save = vi.fn()
  render(<ConnectionDialog draft={{ ...draft, id: "s1", privateKeyPath: "/key", hasSecret: true }} onSave={save} onCancel={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "密码" }))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save.mock.calls[0]?.[0].privateKeyPath).toBeUndefined()
  expect(save.mock.calls[0]?.[0].secret).toBe("")
})
it("连接期间不能重复提交或关闭弹窗", () => {
  const cancel = vi.fn()
  render(<ConnectionDialog draft={draft} saving connectAfterSave onSave={vi.fn()} onCancel={cancel} />)
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
  expect(cancel).not.toHaveBeenCalled()
  expect((screen.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(true)
})
