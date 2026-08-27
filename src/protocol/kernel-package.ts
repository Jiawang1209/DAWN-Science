/**
 * 内核包的名字与装法一句话（原在 `src/kernel/specs.ts`，2026-08-27 搬来）：
 * 界面（首启向导的解释器列表）也要说这句，而 `specs.ts` 带 `node:fs`，不能进渲染进程。
 * **只引导，不执行**（作者定的）。
 */
export const KERNEL_PACKAGE: Record<"python" | "R", { pkg: string; how: string }> = {
  python: { pkg: "ipykernel", how: "<你的 python> -m pip install ipykernel" },
  R: { pkg: "IRkernel", how: 'R 里跑 install.packages("IRkernel"); IRkernel::installspec()' },
}
