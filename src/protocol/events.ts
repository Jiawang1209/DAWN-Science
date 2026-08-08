/**
 * 会话事件通道（Task 2.16）。
 *
 * **方向单一：主进程 → 渲染进程。** 与请求/响应通道
 * `dawn:workbench:invoke` **不合并**——两者的错误语义完全不同：
 * 请求失败要回给发起者并可重试，事件推送失败没有发起者可回。
 *
 * 作者在「轮询」与「事件通道」之间选定后者（2026-08-08），理由是终端下钻
 * 用轮询基本没法要，早晚要走这条路，晚走一次就是白写一遍。
 *
 * ## 三条纪律（都由本文件的 schema 强制，而不是靠调用方自觉）
 *
 *   1. **`seq` 每会话单调递增，从 1 起。** 它是连续性判断的唯一依据，
 *      所以 0 和小数一律拒绝——`seq: 0` 无法与「还没有事件」区分。
 *      渲染侧发现跳号必须出声（规格 7.5），那一半在 `src/ui/client.ts`。
 *   2. **丢弃必须说清丢了多少。** 背压导致的截断发 `dropped` 事件并携带
 *      `droppedChars`，**绝不静默**。`droppedChars: 0` 也拒绝——
 *      「丢了 0 个字符」不是丢弃事件，是噪音。
 *   3. **截断必须可定位。** 订阅结果 `truncated: true` 时**必须**同时给出
 *      最早可用 seq，否则界面只知道「丢了」而不知道「从哪起还有」，
 *      就只能去猜。
 *
 * 一处与计划 §5.2 的措辞偏差：计划写的字段名是 `protocolVersion`，
 * 这里用 `workbenchProtocolVersion`——与既有的成功/错误信封保持一致，
 * 两套命名会让「版本字段叫什么」变成一个要记的事。
 */
import { z } from "zod"

/** 信封的公共字段。事件的 kind 与其载荷平铺在同一层。 */
const envelope = {
  workbenchProtocolVersion: z.string().regex(/^\d+\.\d+$/),
  sessionId: z.string().min(1),
  /** 每会话单调递增，从 1 起 */
  seq: z.int().min(1),
}

/**
 * 会话事件。以 `kind` 判别，**未知 kind 一律拒绝**——
 * 把不认识的 kind 当作「可忽略的扩展」放行，等于让一个拼错的事件类型
 * 静默消失，而事件通道恰恰是最难发现静默丢失的地方。
 */
export const SessionEventSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...envelope,
      kind: z.literal("turn"),
      /** 必填：分不清人和 agent 的对话没有意义 */
      who: z.enum(["user", "agent"]),
      /**
       * **本次增量**，不是整段发言。同一 `turnId` 的增量按 seq 顺序拼接
       * 才是完整的一轮。做成增量而非整段是为了流式显示——
       * 等一整段说完再显示，等待期间界面是死的。
       */
      text: z.string(),
      /** 把增量归拢成一个对话气泡。同一轮内所有增量共用 */
      turnId: z.string().min(1),
      /** 该轮的最后一条增量。**边界是语义，不能靠正文里的换行去猜** */
      final: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...envelope,
      kind: z.literal("bytes"),
      /** PTY 原始字节（含 ANSI 控制序列），交给 xterm 解析 */
      data: z.string(),
    })
    .strict(),
  z
    .object({
      ...envelope,
      kind: z.literal("state"),
      state: z.enum(["alive", "exited"]),
      exitCode: z.int().optional(),
    })
    .strict(),
  z
    .object({
      ...envelope,
      kind: z.literal("dropped"),
      /** 必须为正。见文件头纪律 2 */
      droppedChars: z.int().min(1),
    })
    .strict(),
])
export type SessionEvent = z.infer<typeof SessionEventSchema>

/**
 * 订阅结果：缓冲区内的历史 + 之后走推送。
 *
 * **历史与增量由同一 seq 序列串起**——这是重连不重复也不丢字的前提。
 * 若历史与推送各有各的编号，客户端就无法判断「这条我是不是已经有了」。
 */
export const SubscribeResultSchema = z
  .object({
    sessionId: z.string().min(1),
    events: z.array(SessionEventSchema),
    /** 服务端当前发到第几号。0 表示这个会话还没产生过事件 */
    latestSeq: z.int().min(0),
    /** 请求的 fromSeq 早于缓冲窗口 ⇒ true */
    truncated: z.boolean(),
    /** 缓冲区里最早还留着的 seq。截断时必填 */
    earliestSeq: z.int().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.truncated && v.earliestSeq === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["earliestSeq"],
        message: "truncated 为真时必须给出最早可用 seq——否则界面只知道丢了，不知道从哪起还有",
      })
    }
  })
export type SubscribeResult = z.infer<typeof SubscribeResultSchema>
