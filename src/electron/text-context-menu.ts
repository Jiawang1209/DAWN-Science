import type { ContextMenuParams, MenuItemConstructorOptions } from "electron"

/** Chromium owns selection/editability; native roles preserve undo, IME and paste events. */
export function textContextMenuItems({ isEditable, selectionText, editFlags }: Pick<ContextMenuParams, "isEditable" | "selectionText" | "editFlags">): MenuItemConstructorOptions[] {
  if (!isEditable) return selectionText.length > 0 ? [{ role: "copy", enabled: editFlags.canCopy }] : []
  return [
    { role: "undo", enabled: editFlags.canUndo },
    { role: "redo", enabled: editFlags.canRedo },
    { type: "separator" },
    { role: "cut", enabled: editFlags.canCut },
    { role: "copy", enabled: editFlags.canCopy },
    { role: "paste", enabled: editFlags.canPaste },
    { role: "delete", enabled: editFlags.canDelete },
    { type: "separator" },
    { role: "selectAll", enabled: editFlags.canSelectAll },
  ]
}
