/**
 * 输出清洗（E1）。**不信「请勿复述」**：模型照样会加导语、包代码块、回显指令——
 * 指令归指令，剥归剥（学自 dsh-prompt-enhancer 的经验，规则自己写）。
 *
 * 顺序：整段回显的指令块 → 导语 / 结语 → 对称包裹。最多三轮，直到没变化。
 * **不剥原文前缀**：它那条「结果以原文开头就删掉原文」会吃掉正当的内容
 * （一句合理的改写完全可以先复述原句再展开），我们不做。
 */

const 导语们 = [
  "以下是改写后的提示词",
  "以下是优化后的提示词",
  "改写后的提示词",
  "优化后的提示词",
  "改写结果",
  "优化结果",
  "改写如下",
  "优化如下",
  "Here is the rewritten prompt",
  "Here's the rewritten prompt",
  "Rewritten prompt",
  "Optimized prompt",
]

const 结语们 = ["以上是改写后的提示词", "以上是优化后的提示词", "希望对你有帮助", "如需调整请告诉我", "Let me know if you'd like any changes"]

const 包裹对: readonly [string, string][] = [
  ["```", "```"],
  ['"""', '"""'],
  ["“", "”"],
  ['"', '"'],
  ["「", "」"],
  ["『", "』"],
  ["【", "】"],
]

export function 清洗(原: string): string {
  let s = 原.trim()
  for (let 轮 = 0; 轮 < 3; 轮++) {
    const 前 = s
    s = 剥指令回显(s)
    s = 剥导语(s)
    s = 剥结语(s)
    s = 剥包裹(s)
    if (s === 前) break
  }
  return s
}

/** 模型把「请改写下面这段提示词：""" … """」整个复述了一遍：只留三引号里的 */
function 剥指令回显(s: string): string {
  const m = /^请(?:改写|优化)下面这段提示词[：:]\s*"""\s*([\s\S]*?)\s*"""\s*$/.exec(s)
  return m ? m[1]!.trim() : s
}

function 剥导语(s: string): string {
  for (const 导 of 导语们) {
    if (s.startsWith(导)) {
      // 只剩一句导语、后面什么都没有 → 这就是空输出，别把导语当结果
      return s.slice(导.length).replace(/^[：:\s]*/, "").trim()
    }
  }
  return s
}

function 剥结语(s: string): string {
  for (const 结 of 结语们) {
    const i = s.lastIndexOf(结)
    if (i > 0 && /^[\s.。!！]*$/.test(s.slice(i + 结.length))) return s.slice(0, i).trim()
  }
  return s
}

/**
 * 整段被一对符号包住才剥。**中间还有同样的符号就不剥**——
 * 那多半是内容自己的（比如结果里本来就有一段代码块）。
 */
function 剥包裹(s: string): string {
  for (const [左, 右] of 包裹对) {
    if (s.length > 左.length + 右.length && s.startsWith(左) && s.endsWith(右)) {
      let 内 = s.slice(左.length, s.length - 右.length)
      // 代码块的语言标记：```text\n…
      if (左 === "```") 内 = 内.replace(/^[a-zA-Z0-9_-]*\n/, "")
      if (!内.includes(左) && !内.includes(右)) return 内.trim()
    }
  }
  return s
}
