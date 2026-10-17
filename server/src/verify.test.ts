import { describe, expect, test } from "bun:test";
import { contentHashOf, type DraftClaim, type SourceRecord } from "./hardChecks.ts";
import { verifyClaims, type Judge } from "./verify.ts";

const body = "北岚科技2026年第二季度毛利率为32.4%，较上年同期下降。主要原因是云成本上升。";

const report: SourceRecord = {
  sourceId: "report-beilan",
  body,
  active: true,
  contentHash: contentHashOf(body),
};

const tampered: DraftClaim = {
  id: "tampered",
  text: "北岚科技2026年第二季度毛利率上升到32.4%。",
  sourceId: "report-beilan",
  quote: "毛利率为32.4%，较上年同期下降",
};

const fake: DraftClaim = {
  id: "fake",
  text: "北岚科技毛利率为99%。",
  sourceId: "report-beilan",
  quote: "这段话不在研报里",
};

function sources() {
  return new Map([[report.sourceId, report]]);
}

describe("核实", () => {
  test("仅子串会把数字方向说反的 claim 标成付款", async () => {
    let called = 0;
    const judge: Judge = async () => {
      called += 1;
      return { verdict: "CONTRADICTED", rationale: "不该被调用" };
    };
    const [result] = await verifyClaims({
      claims: [tampered],
      sources: sources(),
      prices: new Map([["report-beilan", "1000"]]),
      method: "baselineA",
      judge,
    });
    expect(called).toBe(0);
    expect(result?.verdict).toBe("SUPPORTED");
    expect(result?.action).toBe("PAID");
    expect(result?.amount).toBe("1000");
  });

  test("硬校验失败时不调用模型，也不付款", async () => {
    let called = 0;
    const judge: Judge = async () => {
      called += 1;
      return { verdict: "SUPPORTED", rationale: "不该被调用", supportingQuote: "毛利率为32.4%" };
    };
    const [result] = await verifyClaims({
      claims: [fake],
      sources: sources(),
      prices: new Map([["report-beilan", "1000"]]),
      method: "ours",
      judge,
    });
    expect(called).toBe(0);
    expect(result?.verdict).toBe("UNSUPPORTED");
    expect(result?.action).toBe("SKIPPED");
    expect(result?.amount).toBeUndefined();
  });

  test("模型判矛盾则标记且不带金额；模型给的金额字段不会被采用", async () => {
    const judge: Judge = async () => {
      return {
        verdict: "CONTRADICTED",
        rationale: "原文是下降，claim 说上升",
        supportingQuote: "较上年同期下降",
        amount: "999999",
      } as Awaited<ReturnType<Judge>>;
    };
    const [result] = await verifyClaims({
      claims: [tampered],
      sources: sources(),
      prices: new Map([["report-beilan", "1000"]]),
      method: "ours",
      judge,
    });
    expect(result?.verdict).toBe("CONTRADICTED");
    expect(result?.action).toBe("FLAGGED");
    expect(result?.amount).toBeUndefined();
  });

  test("ours 判支持时必须给出原文里的 supportingQuote", async () => {
    const missing: Judge = async () => ({ verdict: "SUPPORTED", rationale: "看起来对" });
    const invented: Judge = async () => ({
      verdict: "SUPPORTED",
      rationale: "编了一句",
      supportingQuote: "毛利率上升",
    });
    const [noQuote] = await verifyClaims({
      claims: [tampered],
      sources: sources(),
      prices: new Map([["report-beilan", "1000"]]),
      method: "ours",
      judge: missing,
    });
    const [badQuote] = await verifyClaims({
      claims: [tampered],
      sources: sources(),
      prices: new Map([["report-beilan", "1000"]]),
      method: "ours",
      judge: invented,
    });
    expect(noQuote?.verdict).toBe("UNSUPPORTED");
    expect(badQuote?.verdict).toBe("UNSUPPORTED");
    expect(noQuote?.action).toBe("SKIPPED");
  });

  test("模型抛错时记为未支持，不付款", async () => {
    const judge: Judge = async () => {
      throw new Error("timeout");
    };
    const [result] = await verifyClaims({
      claims: [tampered],
      sources: sources(),
      prices: new Map([["report-beilan", "1000"]]),
      method: "baselineB",
      judge,
    });
    expect(result?.action).toBe("SKIPPED");
    expect(result?.verdict).toBe("UNSUPPORTED");
  });
});
