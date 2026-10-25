import { UserFacingError } from "../errors.js";
import { 认分隔符 } from "../files/table.js";

/** Comparison reads original fields; preview placeholders and permissive quoting cannot establish equality. */
export function readComparisonTable(input: string, maxRows: number) {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = 认分隔符(text);
  const records: string[][] = [];
  let row: string[] = [], field = "";
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  const finishField = () => {
    row.push(field);
    field = "";
    state = "start";
  };
  const finishRecord = () => {
    finishField();
    records.push(row);
    row = [];
    if (records.length > maxRows + 1)
      throw new UserFacingError("表格超过完整比较行数上限，未比较");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (state === "quoted") {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else state = "closed";
      continue;
    }
    if (c === delimiter) { finishField(); continue; }
    if (c === "\r" || c === "\n") {
      finishRecord();
      if (c === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    if (c === '"') {
      if (state !== "start") throw new UserFacingError("表格未加引号的字段含有非法引号，未比较");
      state = "quoted";
      continue;
    }
    if (state === "closed") throw new UserFacingError("表格结束引号后含有非法字符，未比较");
    field += c;
    state = "plain";
  }
  if (state === "quoted") throw new UserFacingError("表格引号未闭合，未比较");
  // A final record separator terminates a record; additional separators are real empty records.
  if (field.length || row.length || state === "closed") finishRecord();
  const [columns = [], ...rows] = records;
  return { columns, rows };
}
