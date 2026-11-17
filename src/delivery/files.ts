/** Shared delivery filesystem boundary; no service, verification or interpreter dependency. */
import { UserFacingError } from "../errors.js";
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** Existing components must be real directories/files, never a symlink, including an absent leaf's parents. */
export function deliveryPath(root: string, path: string): string {
  const base = realpathSync(root),
    target = resolve(base, path),
    rel = relative(base, target);
  if (
    rel === ".." ||
    rel.startsWith(".." + sep) ||
    resolve(base, rel) !== target
  )
    throw new UserFacingError("交付路径在工作区之外");
  let at = base;
  for (const part of rel.split(sep).filter(Boolean)) {
    at = join(at, part);
    try {
      if (lstatSync(at).isSymbolicLink())
        throw new UserFacingError(`交付拒绝符号链接：${path}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return target;
}
export function writeDeliveryFile(
  root: string,
  path: string,
  content: string | Buffer,
): void {
  const target = deliveryPath(root, path);
  mkdirSync(dirname(target), { recursive: true });
  deliveryPath(root, path);
  writeFileSync(target, content, { flag: "wx", mode: 0o600 });
}
