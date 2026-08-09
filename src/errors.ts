/**
 * **打算给用户看的失败。**
 *
 * 协议服务端对异常的策略是刻意的（`workbench/server.ts`）：只有 `fault()` 抛出的
 * 业务性失败会把消息原样交给界面，其余一律归一成 `internal_error`，
 * 原始信息**只进日志**——因为它可能含路径、连接串、密钥片段（学自 Rho）。
 *
 * 那条策略是对的，**问题总在抛错的一侧**：抛普通 `Error` 就等于说「这是意外」，
 * 而意外的消息被扣下是正确的。
 *
 * ## 它为什么住在这里
 *
 * 2026-08-09（①-C · C1）第一次遇到时，它被放在 `session/manager.ts`。
 * **C4 当天就撞了第二次**：`CliRuntime.start()` 抛普通 `Error`，
 * 界面上又变成 `操作 "createSession" 执行失败`——
 * 而 `runtime/` 不能反向依赖 `session/`，于是它只能提到一个中立的地方。
 *
 * **同一条规矩在一天里被我自己违反了一次**，说明它不能靠记性：
 * 谁想让一句话到达用户，就得显式声明，而这个类型必须随手可取。
 */
export class UserFacingError extends Error {
  readonly userFacing = true as const
  constructor(message: string) {
    super(message)
    this.name = "UserFacingError"
  }
}
