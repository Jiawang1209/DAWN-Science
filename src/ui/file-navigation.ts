/** Browser paths travel with forward slashes, including on Windows. No host-OS dependency. */
export function isAbsoluteFilePath(path: string): boolean {
  return /^(?:\/|[a-z]:[\\/]|\\\\)/i.test(path)
}

export function normalizeFilePath(path: string): string {
  // Backslashes are legal POSIX filename characters; only Windows roots give them separator semantics.
  const slash = /^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(path) ? path.replace(/\\/g, "/") : path
  if (/^[a-z]:\/+$/i.test(slash)) return `${slash.slice(0, 2)}/`
  return slash.replace(/\/+$/, "") || (slash.startsWith("/") ? "/" : "")
}

function pathRoot(path: string): string {
  return path.match(/^\/\/[^/]+\/[^/]+/)?.[0] ?? path.match(/^[a-z]:\//i)?.[0] ?? (path.startsWith("/") ? "/" : "")
}

export function parentFilePath(input: string): string | null {
  const path = normalizeFilePath(input), root = pathRoot(path)
  if (!path || path === root) return null
  const parent = path.slice(0, path.lastIndexOf("/"))
  return parent.length < root.length ? root : parent || null
}

export function absoluteFilePath(path: string, project: string): string {
  const root = normalizeFilePath(project)
  const windows = /^(?:[a-z]:\/|\/\/)/i.test(root)
  return path.startsWith("/") || (windows && isAbsoluteFilePath(path)) ? normalizeFilePath(path) : normalizeFilePath(`${root.replace(/\/+$/, "")}/${path}`)
}

/** undefined means a different workspace; empty string is the workspace itself. */
export function relativeFilePath(project: string, input: string): string | undefined {
  const root = normalizeFilePath(project), path = normalizeFilePath(input)
  if (!root || !isAbsoluteFilePath(root)) return undefined
  const windows = /^[a-z]:\//i.test(root) || root.startsWith("//")
  const key = (p: string) => windows ? p.toLowerCase() : p
  if (key(root) === key(path)) return ""
  const prefix = `${root.replace(/\/+$/, "")}/`
  return key(path).startsWith(key(prefix)) ? path.slice(prefix.length) : undefined
}

export function fileAncestors(input: string): { label: string; path: string }[] {
  const path = normalizeFilePath(input), root = pathRoot(path)
  if (!root) return []
  const result = [{ label: root, path: root }]
  let current = root
  for (const part of path.slice(root.length).split("/").filter(Boolean)) {
    current = absoluteFilePath(part, current)
    result.push({ label: part, path: current })
  }
  return result
}

/** The browser returns realpaths; workspace operations still resolve against the original owner root. */
export function browserWorkspacePath(browserRoot: string, ownerRoot: string, workspaceRoot: string, path: string): string | undefined {
  const prefix = relativeFilePath(workspaceRoot, ownerRoot), relative = relativeFilePath(browserRoot, path)
  if (prefix === undefined || relative === undefined) return undefined
  return [prefix, relative].filter(Boolean).join("/")
}

export function toggleExpandedFiles(expanded: readonly string[], path: string, open: boolean, root: string): readonly string[] {
  const canonical = [...new Set(expanded.map(value => absoluteFilePath(value, root)))]
  if (open) return canonical.includes(path) ? canonical : [...canonical, path]
  return canonical.filter(value => value !== path && !value.startsWith(`${path.replace(/\/+$/, "")}/`))
}
