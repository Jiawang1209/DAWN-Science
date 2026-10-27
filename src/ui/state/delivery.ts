import { DeliveryPathSchema } from "../../protocol/delivery.js";
/** Renderer navigation/drafts only. Durable delivery facts belong to the backend.
 * Keys must include session, workspace and remote identity; never persist file bytes. */
import { atom } from "nanostores";
import { z } from "zod";
const ViewSchema = z.object({
  page: z.enum(["files", "select", "options", "records", "detail", "verify"]),
  selected: z.array(z.string()),
  candidates: z.array(z.string()),
  name: z.string(),
  references: z.string(),
  mode: z.enum(["organize", "validate"]),
  retained: z.array(z.object({path:z.string(),retainedId:z.string(),memberId:z.string(),sha256:z.string()})).optional(),
  recordId: z.string().optional(),
  file: z.string().optional(),
  pendingId: z.string().optional(),
  verificationDraft: z
    .object({ recordId: z.string(), plan: z.string(), tolerance: z.string() })
    .optional(),
});
export type DeliveryView = z.infer<typeof ViewSchema>;
const KEY = "dawn.session.analysis-delivery-views";
const empty: DeliveryView = {
  page: "files",
  selected: [],
  candidates: [],
  name: "",
  references: "",
  mode: "organize",
};
function load(): ReadonlyMap<string, DeliveryView> {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return new Map();
    return new Map(
      raw.flatMap((row) => {
        if (!Array.isArray(row) || typeof row[0] !== "string") return [];
        const parsed = ViewSchema.safeParse(row[1]);
        return parsed.success
          ? [[row[0], parsed.data] as [string, DeliveryView]]
          : [];
      }),
    );
  } catch {
    return new Map();
  }
}
export const $deliveryViews = atom<ReadonlyMap<string, DeliveryView>>(load());
export function deliveryView(scope: string) {
  return $deliveryViews.get().get(scope) ?? empty;
}
export function setDeliveryView(
  scope: string,
  patch: Partial<DeliveryView>,
): void {
  const next = new Map($deliveryViews.get());
  next.delete(scope);
  next.set(scope, { ...deliveryView(scope), ...patch });
  if (next.size > 50) next.delete(next.keys().next().value!);
  $deliveryViews.set(next);
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...next]));
  } catch (e) {
    console.warn("[delivery draft persistence]", e);
  }
}
export function beginDelivery(
  scope: string,
  paths: readonly string[] = [],
): void {
  setDeliveryView(scope, {
    page: "select",
    selected: [...new Set(paths)],
    candidates: [...new Set(paths)],
    retained: [],
    file: undefined,
    recordId: undefined,
  });
}

/** Bot records use absolute paths; route records use relative paths. Both must stay in this workspace. */
export function deliverySelectionPaths(
  paths: readonly string[],
  workspace: string | undefined,
): string[] {
  const root = workspace?.replace(/\\/g, "/").replace(/\/+$/, "");
  return [
    ...new Set(
      paths.map((value) => {
        const path = value.replace(/\\/g, "/");
        return DeliveryPathSchema.parse(
          root && path.startsWith(root + "/")
            ? path.slice(root.length + 1)
            : path,
        );
      }),
    ),
  ];
}
