/**
 * 把一段统一 diff 拆成**能画出行号的行**（2026-08-18）。
 *
 * ## 为什么要有行号
 *
 * 作者定的是「审阅那一屏的排版学 Codex」。**量了一遍**（读的是构建产物的
 * CSS，不是源码——边界写在 `docs/REFERENCES.md`）：
 *
 * | 事实 | 值 |
 * |---|---|
 * | `--diffs-min-number-column-width` | `4ch` ← **有一列行号，而且给了最小宽** |
 * | `--diffs-line-height` | 字号 × **1.8** |
 * | `--diffs-font-size` | 12px |
 * | `--color-editor-added` / `-deleted` | 亮色 **15%** 兑透明，暗色 **23%** |
 *
 * 行号是里面最实的一条：没有它，一句「这里改了」在屏幕上落不到文件的某一行，
 * 人要拿这段 diff 回到编辑器里就只能自己数。
 *
 * ## 只给一列，不给两列
 *
 * GitHub 那种「旧行号 ｜ 新行号」两列在我们这儿放不下：坞的宽度是
 * 280–720px（`state/right-dock.ts`），两列 `4ch` 的行号加起来就吃掉近 60px。
 *
 * 所以是**一列**：加行与上下文给**新文件**里的行号，删行给**旧文件**里的行号。
 * 分辨靠 `+`／`−` 号与颜色——**它们本来就在那儿**，不是新造的判据。
 *
 * ## 前言四行不画
 *
 * `diff --git` / `index` / `---` / `+++` 说的是「这是哪个文件」，
 * 而那句话已经由上面那条文件头说了，**而且说得更清楚**（还带状态与增删行数）。
 * 留着就是同一件事说两遍。
 *
 * **其余的元信息一律留着**：`new file mode`、`rename from/to`、
 * `Binary files … differ`、`\ No newline at end of file` 都是**只有这里才说得出**
 * 的事实，删掉就是静默丢信息（规格 7.5）。
 */

export type 差异行类型 = "add" | "del" | "context" | "hunk" | "meta"

export interface 差异行 {
  类型: 差异行类型
  /** 原文那一行，**含 `+` / `−` 前缀**——前缀本身就是判据，不能剥掉 */
  文本: string
  /**
   * 画在左边那一列的行号。
   *
   * 加行与上下文给的是**新文件**里的行号，删行给的是**旧文件**里的。
   * `undefined` = 这一行不属于任何一个文件（块头、元信息）。
   */
  行号?: number
}

/** 这四种说的是「这是哪个文件」，而文件头已经说过了 */
const 前言 = /^(diff --git |index |--- |\+\+\+ )/

/** `@@ -旧起点,旧行数 +新起点,新行数 @@` */
const 块头 = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function 拆统一diff(原文: string): 差异行[] {
  const 出: 差异行[] = []
  let 旧号 = 0
  let 新号 = 0
  let 在块里 = false

  const 全部行 = 原文.split("\n")
  // 末尾那个空行是 split 造出来的，不是 diff 的一行
  if (全部行.length > 0 && 全部行[全部行.length - 1] === "") 全部行.pop()

  for (const 行 of 全部行) {
    const 块 = 块头.exec(行)
    if (块) {
      旧号 = Number(块[1])
      新号 = Number(块[2])
      在块里 = true
      出.push({ 类型: "hunk", 文本: 行 })
      continue
    }
    if (!在块里 || 前言.test(行)) {
      // **块外的东西一律是元信息**，前言那四行不画，其余照画
      if (!前言.test(行)) 出.push({ 类型: "meta", 文本: 行 })
      continue
    }
    /**
     * `\ No newline at end of file` 是 git 自己的旁白，**不占文件的一行**。
     * 给它编一个行号，那个号码就是假的。
     */
    if (行.startsWith("\\")) {
      出.push({ 类型: "meta", 文本: 行 })
      continue
    }
    if (行.startsWith("+")) {
      出.push({ 类型: "add", 文本: 行, 行号: 新号++ })
      continue
    }
    if (行.startsWith("-")) {
      出.push({ 类型: "del", 文本: 行, 行号: 旧号++ })
      continue
    }
    /**
     * 上下文行。**空串也算上下文**——原文里的空行经 `split` 之后就是空串，
     * 当成元信息的话它会丢掉行号，后面每一行的号码就都偏了。
     */
    出.push({ 类型: "context", 文本: 行, 行号: 新号++ })
    旧号 += 1
  }

  return 出
}
