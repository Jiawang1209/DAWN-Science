import { describe, expect, it } from "vitest"
import { textContextMenuItems } from "../../src/electron/text-context-menu.js"

const editFlags = { canUndo: false, canRedo: false, canCut: false, canCopy: false, canPaste: true, canDelete: false, canSelectAll: true, canEditRichly: false }

describe("native text context menu", () => {
  it("keeps blank non-editable areas free of text menus", () => {
    expect(textContextMenuItems({ isEditable: false, selectionText: "", editFlags })).toEqual([])
  })

  it("offers only copy for read-only text, including whitespace selections", () => {
    expect(textContextMenuItems({ isEditable: false, selectionText: "  ", editFlags: { ...editFlags, canCopy: true } })).toEqual([{ role: "copy", enabled: true }])
  })

  it("uses Chromium permissions for empty, selected and protected edit fields", () => {
    for (const allowed of [false, true]) {
      const flags = Object.fromEntries(Object.keys(editFlags).map(key => [key, allowed])) as typeof editFlags
      const items = textContextMenuItems({ isEditable: true, selectionText: "文本", editFlags: flags })
      expect(items.filter(item => item.type !== "separator")).toEqual(
        ["undo", "redo", "cut", "copy", "paste", "delete", "selectAll"].map(role => ({ role, enabled: allowed })),
      )
    }
  })
})
