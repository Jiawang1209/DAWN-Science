import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const within = (root: string, target: string) => {
  const path = relative(root, target);
  return (
    path !== ".." &&
    !path.startsWith("../") &&
    !path.startsWith("..\\") &&
    !isAbsolute(path)
  );
};

/** Validate before mkdir: a missing skills root may have an existing symlink ancestor. */
export function assertProjectInstallRoot(
  workspace: string,
  target: string,
): void {
  const root = resolve(workspace);
  let ancestor = resolve(target);
  if (!within(root, ancestor))
    throw new Error("Skill install root is outside the project");
  const canonicalRoot = realpathSync(root);
  for (;;) {
    try {
      lstatSync(ancestor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
      continue;
    }
    // A dangling symlink must fail here, rather than be mistaken for a missing directory.
    if (!within(canonicalRoot, realpathSync(ancestor)))
      throw new Error("Skill install root resolves outside the project");
    return;
  }
}
