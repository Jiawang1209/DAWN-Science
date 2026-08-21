/**
 * 「新建会话，用哪个 LLM」那一组的排法（2026-08-21，作者要的：
 * *「要对模型进行分类，API 放到一起，ACP 放到一起，CLI 放到一起，现在太乱了。
 * 每一个类型之内，要按照英文字母进行排序。」*）。
 *
 * 此前按配置文件里的先后顺序平铺——加一个就挂在尾巴上，三路混在一起。
 * **组的顺序写死**：API 在前（绝大多数人唯一会用到的），然后 ACP、CLI，
 * 再是别的（内核之类）。组内按显示名的字母序，**不分大小写**——
 * `DeepSeek` 与 `claude-code-acp` 混排时大小写敏感会把大写全排到前面。
 */
export type AgentKind = "native" | "pty" | "cli" | "kernel" | "acp"

const 组序: readonly (AgentKind | "其它")[] = ["native", "acp", "cli", "其它"]

export interface AgentGroup {
  kind: AgentKind | "其它"
  agentIds: string[]
}

export function 按类分组(
  agentIds: readonly string[],
  kindOf: (id: string) => AgentKind | undefined,
  labelOf: (id: string) => string,
): AgentGroup[] {
  const 桶 = new Map<AgentKind | "其它", string[]>()
  for (const id of agentIds) {
    const k = kindOf(id)
    const 键: AgentKind | "其它" = k === "native" || k === "acp" || k === "cli" ? k : "其它"
    const 有 = 桶.get(键)
    if (有) 有.push(id)
    else 桶.set(键, [id])
  }
  const 比 = (a: string, b: string) =>
    labelOf(a).localeCompare(labelOf(b), "en", { sensitivity: "base" }) || a.localeCompare(b)
  return 组序
    .filter((k) => 桶.has(k))
    .map((k) => ({ kind: k, agentIds: [...桶.get(k)!].sort(比) }))
}
