/** Large installed catalogs use bounded retrieval; SDK command expansion keeps every entry. */
export const SKILL_PROMPT_HINT_LIMIT = 20
export function skillPromptEntries<T extends { disableModelInvocation?: boolean }>(skills: readonly T[], installedCount: number): T[] {
  return installedCount > SKILL_PROMPT_HINT_LIMIT
    ? skills.map(skill => ({ ...skill, disableModelInvocation: true }))
    : [...skills]
}

export const SKILL_RETRIEVAL_GUIDANCE =
  'Installed workflow instructions are available through search_skills and use_skill. ' +
  'For a task that may benefit from an existing workflow, search with concrete task/domain terms, inspect the literal match evidence, then use_skill to read the selected method and references. ' +
  'Ordinary chat or conceptual explanations do not require a Skill. A search match is a candidate, not proof of suitability; read the instructions before following them. ' +
  'Use exact returned names and page only as needed. A failed search does not mean the installed catalog is empty. ' +
  'Manual-only Skills require the user to invoke /skill:name; disabled Skills cannot be loaded by another route. ' +
  'Reading instructions never executes their scripts, grants tools, approves other steps or establishes scientific validity.'
