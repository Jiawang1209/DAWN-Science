/**
 * 更新这件事的**唯一一份真相**（规格 U1）。侧栏那一行与设置里的「关于」都读它。
 *
 * 两处各自算一遍的话，必然出现「侧栏说有新版、关于说已是最新」这种谁也不敢信的画面。
 */
import type { 资源一个, 换包方式 } from "./资源.js"

/** 有新版时，能不能由我们自己装上（规格 U3 的那张表） */
export type 可装性 =
  | { 可装: true; 资源: 资源一个; 方式: 换包方式 }
  | { 可装: false; 装不了因为: string }

export interface 新版基本 {
  当前: string
  /** 原样的 tag（`v0.0.3`） */
  版本: string
  页面: string
  发布于?: string
  查于: number
}

export type 更新状态 =
  /** 还没查过 */
  | { 阶段: "idle"; 当前: string }
  | { 阶段: "checking"; 当前: string }
  | { 阶段: "latest"; 当前: string; 查于: number }
  /** 有新版，等人决定 */
  | ({ 阶段: "available" } & 新版基本 & 可装性)
  /** 有新版，但人说了「这一版不再提醒」——**关于那一格里照样看得见** */
  | ({ 阶段: "ignored" } & 新版基本 & 可装性)
  | ({ 阶段: "downloading"; 已下: number; 共: number } & 新版基本)
  | ({ 阶段: "ready"; 包路径: string } & 新版基本)
  /** 查或下失败。**原话必须在里面**（规格 7.5） */
  | { 阶段: "failed"; 当前: string; 原话: string }

/** 落在 `userData/update.json` 的东西。**机器写的状态，不进 `providers.yaml`** */
export interface 更新盘面 {
  /** 启动时自动检查 */
  auto: boolean
  /** 上一次**成功**查完的时刻。失败不前移它 */
  lastCheckedAt?: number
  /** 「这一版不再提醒」记下的版本号 */
  ignored?: string
  /** 已经下好、等着装的那个包 */
  ready?: { 版本: string; 包路径: string }
}

export const 盘面默认值: 更新盘面 = { auto: true }
