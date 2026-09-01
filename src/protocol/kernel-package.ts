/**
 * 内核包的名字与装法一句话（原在 `src/kernel/specs.ts`，2026-08-27 搬来）：
 * 界面（首启向导的解释器列表）也要说这句，而 `specs.ts` 带 `node:fs`，不能进渲染进程。
 * **只引导，不执行**（作者定的）。
 *
 * **`how` 必须是一条光秃秃的命令，一个汉字都不带**（B16，2026-09-01）：
 * 它被整个塞进 `tf()` 的插值里，插值不过 i18n——R 那条原先写着「R 里跑 …」、
 * python 那条写着「<你的 python>」，英文界面上都露出一截中文。
 * 第一个词是可执行程序名；知道具体路径的调用点（解释器列表）把它换成选中的那条。
 */
export const KERNEL_PACKAGE: Record<"python" | "R", { pkg: string; how: string }> = {
  python: { pkg: "ipykernel", how: "python -m pip install ipykernel" },
  R: { pkg: "IRkernel", how: `R -e 'install.packages("IRkernel"); IRkernel::installspec()'` },
}
