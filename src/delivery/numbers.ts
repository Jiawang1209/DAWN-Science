import { UserFacingError } from "../errors.js";

export const numericText = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Keep decimal identity before any conversion to binary floating point. */
export class ComparedNumber {
  constructor(readonly source: string) {}
}

function decimalKey(source: string): string {
  const [mantissa = "", exponent = "0"] = source.toLowerCase().split("e");
  const [whole = "", fraction = ""] = mantissa.replace(/^[+-]/, "").split(".");
  const digits = (whole + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  const significant = digits.replace(/0+$/, "");
  const power = BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length);
  return `${mantissa.startsWith("-") ? "-" : ""}${significant}e${power}`;
}

export function equalNumbers(a: ComparedNumber, b: ComparedNumber, tolerance: number): boolean {
  const xKey = decimalKey(a.source), yKey = decimalKey(b.source);
  if (xKey === yKey) return true;
  if (tolerance === 0) return false;
  const x = Number(a.source), y = Number(b.source);
  // Without field roles, integer-valued data is exact, including unknown category codes.
  // Reject rounded/underflowed decimal sources instead of applying tolerance after data loss.
  if (!Number.isFinite(x) || !Number.isFinite(y) || Number.isInteger(x) || Number.isInteger(y)
    || decimalKey(String(x)) !== xKey || decimalKey(String(y)) !== yKey) return false;
  return Math.abs(x - y) <= tolerance * Math.max(1, Math.abs(x));
}

export function identityField(name: string): boolean {
  return /(?:^|[_\s-])(?:ids?|identifier|code|category|class|group|label)(?:$|[_\s-])/i.test(name.replace(/([a-z0-9])([A-Z])/g, "$1_$2"))
    || /编号|标识|代码|编码|类别|分类|分组|标签/.test(name);
}

export function exactNumericField(name: string): boolean {
  return identityField(name) || /^(n(?:_.+)?|count|sample_size|样本量)$/i.test(name);
}

export function parseComparisonJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    // Node >=22 / bundled Electron expose the source, even when value already rounded.
    if (context?.source === undefined)
      throw new UserFacingError("当前运行时不能保留 JSON 数值原文，未比较");
    return new ComparedNumber(context.source);
  });
}
