import { describe, expect, test } from "bun:test";
import { gasLimit } from "./gas.ts";

describe("gas limit", () => {
  test("按 Monad 计费习惯把估算乘上 1.075", () => {
    expect(gasLimit(100_000n)).toBe(107_500n);
    expect(gasLimit(1n)).toBe(1n);
  });
});
