import { expect, it } from "vitest";
import { compareDeliveryText } from "../../src/delivery/verify.js";
const compare = (a: string, b: string) => compareDeliveryText(a, b, "table", 0);

it.each([
  ["header whitespace", " id,value\nA,1", "id,value\nA,1"],
  ["preview placeholder collision", ",value\nA,1", "（第 1 列没有名字）,value\nA,1"],
  ["removed final empty record", "id\nA\n\n", "id\nA\n"],
  ["changed quoted CRLF", 'id,label\r\n1,"a\r\nb"', 'id,label\n1,"a\nb"'],
] as const)("keeps original table identity: %s", (_name, a, b) => {
  expect(compare(a, b).same).toBe(false);
});

it.each([
  'id,label\n1,"open',
  'id,label\n1,ab"cd',
  'id,label\n1,"a"tail',
  'id,label\n1,"a" ',
] as const)("does not compare malformed quoted CSV: %s", text => {
  expect(() => compare(text, text)).toThrow(/引号/);
});

it.each([
  'id,label\n1,"北京, 中国"\n2,"a""b"\n',
  'id;label\r\n1;"a; b"\r\n2;"多行\r\n文本"\r\n',
  'id\tlabel\n1\t"a\tb"\n',
  ',value\nA,2.5\n',
  ' id ,value\nA,2.5\n',
] as const)("still compares valid delimited records: %s", text => {
  expect(compare(text, text).same).toBe(true);
});

it("treats record terminators consistently while preserving explicit empty records", () => {
  expect(compare("id,label\r\nA,x\r\n", "id,label\nA,x").same).toBe(true);
  expect(compare('id\n""\n', "id\n\n").same).toBe(true);
  expect(compare("\uFEFFid,value\nA,1", "id,value\nA,1").same).toBe(true);
});

it("rejects empty or duplicated raw headers rather than inventing preview names", () => {
  for (const text of ["", "\n", ",\na,b", "id,id\na,b", ",,value\na,b,1"])
    expect(compare(text, text).same).toBe(false);
});

it("keeps the full-comparison row budget", () => {
  const data = "id\n" + Array.from({ length: 20_001 }, (_, i) => String(i)).join("\n");
  expect(() => compare(data, data)).toThrow(/完整比较行数上限/);
});
