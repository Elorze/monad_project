import { describe, expect, test } from "bun:test";
import { recordedCloseTx, txForRecordedAction } from "./demoReceipts.ts";

describe("已上链的演示回执", () => {
  test("动作和链上一致时才附上交易", () => {
    expect(txForRecordedAction("c-margin", "PAID")).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(txForRecordedAction("c-flip", "FLAGGED")).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(txForRecordedAction("c-driver", "SKIPPED")).toBeUndefined();
  });

  test("有说法被预算改写时，不把当时的退款交易算到这一次", () => {
    expect(
      recordedCloseTx([
        { claimId: "c-margin", action: "PAID" },
        { claimId: "c-driver", action: "PAID" },
        { claimId: "c-flip", action: "FLAGGED" },
      ]),
    ).toBeDefined();
    expect(
      recordedCloseTx([
        { claimId: "c-margin", action: "PAID" },
        { claimId: "c-driver", action: "SKIPPED" },
        { claimId: "c-flip", action: "FLAGGED" },
      ]),
    ).toBeUndefined();
  });
});
