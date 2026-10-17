import { describe, expect, test } from "bun:test";
import { canonicalJson, evidenceHashOf } from "./evidence.ts";

describe("证据哈希", () => {
  test("字段顺序不影响哈希，内容变化会改变哈希", () => {
    const left = { version: 1, claim: "毛利率为32.4%", model: "glm-4-flash" };
    const right = { model: "glm-4-flash", claim: "毛利率为32.4%", version: 1 };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(evidenceHashOf(left)).toBe(evidenceHashOf(right));
    expect(evidenceHashOf({ ...left, claim: "毛利率为23.4%" })).not.toBe(evidenceHashOf(left));
  });

  test("金额必须是字符串", () => {
    expect(() => evidenceHashOf({ amount: 1000n })).toThrow();
  });
});
