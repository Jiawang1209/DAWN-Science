import { atom } from "nanostores"

export type WorkStepMode = "simple" | "standard"
export const WORK_STEP_MODE_KEY = "dawn.global.work-step-mode"
export const $workStepMode = atom<WorkStepMode>("standard")

export function setWorkStepMode(mode: WorkStepMode): void {
  $workStepMode.set(mode)
  try {
    localStorage.setItem(WORK_STEP_MODE_KEY, mode)
  } catch (error) {
    console.error("[work-steps] 无法保存工作步骤展示设置，本次切换仍然生效：", error)
  }
}

export function loadWorkStepMode(): WorkStepMode {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(WORK_STEP_MODE_KEY)
  } catch (error) {
    console.error("[work-steps] 无法读取工作步骤展示设置，使用标准模式：", error)
  }
  const mode = saved === "simple" || saved === "standard" ? saved : "standard"
  $workStepMode.set(mode)
  return mode
}
