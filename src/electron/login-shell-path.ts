/**
 * **问登录 shell 要 PATH——纯函数部分**（2026-09-01 从 main.ts 拆出来的）。
 *
 * 背景见 main.ts 的 `补登录shell的PATH`：Finder 起的 Electron 只有 launchd 的 PATH，
 * 得问一次用户的登录 shell。这里管两件事：**问的那句命令**，和**回来的 stdout 怎么读**。
 *
 * 拆出来的直接原因是 fish（2026-09-01 审出的）：老命令是 `echo __DAWN_PATH__$PATH`，
 * 而 fish 里 `$PATH` 是**列表**，前缀会被分发到每个元素——一行
 * `__DAWN_PATH__/opt/homebrew/bin __DAWN_PATH__/usr/bin …`。旧实现 `startsWith` 命中、
 * `split(":")` 得到**一个**带空格与字面标记的假段并进了 PATH，日志还写「已并入 1 段」。
 * 一个说自己成功了的失败，比失败更糟。
 *
 * 所以现在：
 *   1. 命令按 shell 选——fish 先 `string join :` 成一条字符串；其余 shell `$PATH` 本来就是字符串；
 *   2. 用 printf 把 PATH 夹在**两枚各占一行的哨兵**之间——banner / MOTD 在哨兵外面，不管它印什么；
 *   3. 每一段都验：非空、以 `/` 开头、不含换行、不含 `__DAWN_PATH`（哨兵或老标记）。分发形状的破绽是
 *      段里混进了标记文字，**不是空格**——macOS 的 PATH 里本来就有带空格的正经目录
 *      （`/Applications/VMware Fusion.app/Contents/Public`、JetBrains Toolbox 的 scripts），弃掉它们是倒退。
 *      弃了什么写在 `弃` 里，让调用方记进 startup.log；
 *   4. 一段可用的都没有时给 `问题`——调用方必须把它记下来，不许静默。
 */

/** 两枚哨兵各占一行；shell 的 banner 不会恰好印这两行 */
export const PATH起 = "__DAWN_PATH_BEGIN__"
export const PATH止 = "__DAWN_PATH_END__"

/**
 * 按 shell 的文件名选命令。只分 fish 与其它：sh / bash / zsh / dash / ksh 的 `$PATH` 与 printf 语义一致。
 * csh / tcsh 连 `-lc` 都不收，在调用方的 err 分支里记日志，这里不特殊照顾。
 */
export function 问PATH的命令(shell: string): string {
  const 名 = shell.split("/").pop() ?? shell
  // fish 单引号里 `\n` 是字面量，由 printf 自己解释；`(…)` 是 fish 的命令替换
  const 值 = 名 === "fish" ? "(string join : $PATH)" : '"$PATH"'
  return `printf '${PATH起}\\n%s\\n${PATH止}\\n' ${值}`
}

export interface PATH合并结果 {
  /** shell 给的、验过且去重后的段（顺序照 shell） */
  段: string[]
  /** 并好的 PATH：`段` 在前，现有的排后面，重复只留一份；没并进任何东西时就是现有的原样 */
  合并后: string
  /** 验不过被弃掉的段——调用方要把它们说出来 */
  弃: string[]
  /** 要记进日志的话：一段可用的都没有时是为什么；有弃掉的段时是弃了哪些。没这个字段就是干干净净 */
  问题?: string
}

/**
 * 读登录 shell 的 stdout，取两枚哨兵之间的 PATH，并进 `现有`。
 * 纯函数：不碰 process.env，不写日志——那两件事归调用方。
 */
export function 合并PATH(stdout: string, 现有: string): PATH合并结果 {
  const 现有段 = 现有.split(":").filter(Boolean)
  const 原样 = (问题: string): PATH合并结果 => ({ 段: [], 合并后: 现有, 弃: [], 问题 })

  const 行 = stdout.split("\n").map((l) => l.replace(/\r$/, ""))
  const 起 = 行.indexOf(PATH起)
  const 止 = 起 < 0 ? -1 : 行.indexOf(PATH止, 起 + 1)
  if (起 < 0 || 止 < 0) return 原样("stdout 里没找到成对的标记")

  // 中间正常只有一行；PATH 里真有换行时会是多行——按 "\n" 接回去，那一段含空白会在下面被弃掉
  const 中间 = 行.slice(起 + 1, 止).join("\n")
  if (中间.trim() === "") return 原样("标记之间是空的，shell 没回 PATH")

  const 段: string[] = []
  const 弃: string[] = []
  for (const 段落 of 中间.split(":")) {
    if (段落 === "") continue // 相邻两个冒号；不算问题，也没东西可并
    if (!段落.startsWith("/") || 段落.includes("\n") || 段落.includes("__DAWN_PATH")) {
      弃.push(段落)
      continue
    }
    if (!段.includes(段落)) 段.push(段落)
  }

  const 合并后 = [...段, ...现有段.filter((s) => !段.includes(s))].join(":")
  const 弃说明 = 弃.length ? `弃掉 ${弃.length} 段（不以 / 开头、含换行或混进了标记文字）：${弃.map((s) => JSON.stringify(s)).join(" ")}` : undefined
  if (段.length === 0) return { 段, 合并后: 现有, 弃, 问题: `一段可用的都没有；${弃说明 ?? "标记之间没有像路径的东西"}` }
  return { 段, 合并后, 弃, ...(弃说明 ? { 问题: 弃说明 } : {}) }
}
