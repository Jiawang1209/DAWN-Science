import { beforeEach, expect, it, vi } from "vitest"
import { $workspaceFolders, WORKSPACE_FOLDERS_KEY, addWorkspaceFolder, removeWorkspaceFolder, loadSidebar, readWorkspaceFolders } from "../../src/ui/state/sidebar.js"

beforeEach(() => { localStorage.clear(); $workspaceFolders.set([]) })
it("显式加入的目录去重并跨重启恢复；移除后不再恢复", () => {
  addWorkspaceFolder("/one")
  addWorkspaceFolder("/two")
  addWorkspaceFolder("/one")
  expect($workspaceFolders.get()).toEqual(["/one", "/two"])
  $workspaceFolders.set([])
  loadSidebar()
  expect($workspaceFolders.get()).toEqual(["/one", "/two"])
  removeWorkspaceFolder("/one")
  expect(readWorkspaceFolders()).toEqual(["/two"])
})
it("坏存储会说明原因并回落；空路径不加入", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {})
  localStorage.setItem(WORKSPACE_FOLDERS_KEY, '["/one",null]')
  expect(readWorkspaceFolders()).toEqual([])
  expect(error).toHaveBeenCalled()
  error.mockRestore()
  addWorkspaceFolder("  ")
  expect($workspaceFolders.get()).toEqual([])
})
