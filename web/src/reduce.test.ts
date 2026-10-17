import { describe, expect, test } from "bun:test";
import { emptyAnswer, explorerTx, reduceAnswer, takeSseEvents, usdc, verdictLabel } from "./reduce.ts";

describe("页面状态", () => {
  test("半包的 SSE 先留着，收齐再解析", () => {
    const first = takeSseEvents('data: {"type":"answer","answer":"毛利');
    expect(first.events).toEqual([]);
    expect(first.rest).toContain("毛利");
    const second = takeSseEvents(`${first.rest}率"}\n`);
    expect(second.events[0]?.type).toBe("answer");
  });

  test("按事件累积说法、付款和退款", () => {
    let state = emptyAnswer();
    state = reduceAnswer(state, { type: "answer", answer: "毛利率为32.4%。" });
    state = reduceAnswer(state, {
      type: "claim",
      claimId: "c-margin",
      text: "毛利率为32.4%。",
      quote: "毛利率为32.4%",
      sourceId: "report-beilan",
      verdict: "SUPPORTED",
      action: "PAID",
      amount: "1000",
      rationale: "原文一致",
      evidenceHash: "0x" + "ab".repeat(32),
      txHash: "0x" + "cd".repeat(32),
    });
    state = reduceAnswer(state, { type: "done", spent: "1000", refund: "4000", refundTx: "0x" + "ef".repeat(32) });
    expect(state.answer).toContain("32.4%");
    expect(state.claims).toHaveLength(1);
    expect(state.spent).toBe("1000");
    expect(state.refundTx).toMatch(/^0xef/);
    expect(verdictLabel("CONTRADICTED")).toBe("矛盾，拒付");
    expect(usdc("1000")).toBe("0.001");
    expect(explorerTx(state.claims[0]?.txHash ?? "")).toContain("testnet.monadexplorer.com/tx/0xcd");
  });
});
