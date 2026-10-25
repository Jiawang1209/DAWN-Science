import { expect, it } from "vitest";
import { compareDeliveryText } from "../../src/delivery/verify.js";
it("compares the full table rather than only preview rows", () => {
  const original =
    "id,value\n" +
    Array.from({ length: 400 }, (_, i) => `${i},${i}`).join("\n");
  const changed = original.replace("399,399", "399,400");
  expect(compareDeliveryText(original, changed, "table", 1e-9).same).toBe(
    false,
  );
});
it("uses fixed tolerance for continuous values and exact effective sample counts", () => {
  expect(
    compareDeliveryText(
      "n_effective,slope\n28,2.5",
      "n_effective,slope\n28.001,2.5",
      "table",
      0.01,
    ).same,
  ).toBe(false);
  expect(
    compareDeliveryText(
      "n,slope\n28,2.5",
      "n,slope\n28,2.500000001",
      "table",
      1e-9,
    ).same,
  ).toBe(true);
  expect(
    compareDeliveryText(
      '{"n_effective":28}',
      '{"n_effective":28.001}',
      "json",
      0.01,
    ).same,
  ).toBe(false);
});
it("does not silently accept reordered rows or mismatched schemas", () => {
  expect(
    compareDeliveryText("id,value\na,1\nb,2", "id,value\nb,2\na,1", "table", 0)
      .same,
  ).toBe(false);
  expect(
    compareDeliveryText("id,value\na,1", "id,changed\na,1", "table", 0).same,
  ).toBe(false);
});

it.each([
  ["id", "001", "1", 0],
  ["value", "001", "1", 0],
  ["sample_id", "1", "1.0", 0],
  ["category", "10000000", "10000001", 1e-6],
  ["category", "1.5", "1.5001", 0.01],
  ["分组", "1.5", "1.5001", 0.01],
  ["value", "9007199254740992", "9007199254740993", 0],
  ["value", "9007199254740993", "9007199254740994", 0.01],
  ["value", "9007199254740992.1", "9007199254740992.2", 0],
  ["value", "1.00000000000000001", "1.00000000000000002", 0],
  ["value", "1e-400", "2e-400", 0],
  ["unknown", "10000000", "10000001", 1e-6],
] as const)("keeps table field %s distinct: %s / %s (tolerance %s)", (field, a, b, tol) => {
  const result = compareDeliveryText(`${field}\n${a}`, `${field}\n${b}`, "table", tol);
  expect(result.same).toBe(false);
  expect(result.note).toContain(field);
});

it.each([
  ['{"id":9007199254740992}', '{"id":9007199254740993}', 0],
  ['{"category":[1.5]}', '{"category":[1.5001]}', 0.01],
  ['{"n_effective":9007199254740992}', '{"n_effective":9007199254740993}', 0],
  ['[10000000]', '[10000001]', 1e-6],
  ['{"value":1.00000000000000001}', '{"value":1.00000000000000002}', 0],
  ['{"value":1e-400}', '{"value":2e-400}', 0],
  ['{"value":1.5}', '{"value":"1.5"}', 0.01],
  ['{"value":[]}', '{"value":{}}', 0],
  ['[1]', '{"0":1}', 0],
] as const)("preserves JSON numeric identity: %s / %s", (a, b, tol) => {
  expect(compareDeliveryText(a, b, "json", tol).same).toBe(false);
});

it.each(["table", "json"] as const)("keeps %s decimal tolerance and exact decimal equivalence", kind => {
  const data = (n: string) => kind === "table" ? `value\n${n}` : `{"value":${n}}`;
  expect(compareDeliveryText(data("2.5"), data("2.500000001"), kind, 1e-9).same).toBe(true);
  expect(compareDeliveryText(data("2.5"), data("2.51"), kind, 1e-9).same).toBe(false);
  expect(compareDeliveryText(data("9007199254740993"), data("9007199254740993.0"), kind, 0).same).toBe(true);
  expect(compareDeliveryText(data("1e-400"), data("0.1e-399"), kind, 0).same).toBe(true);
});
