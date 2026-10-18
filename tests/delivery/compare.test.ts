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
