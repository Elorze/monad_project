import { describe, expect, test } from "bun:test";
import { checkClaims, contentHashOf, type DraftClaim, type SourceRecord } from "./hardChecks.ts";

const body = "北岚科技2026年第二季度毛利率为32.4%，较上年同期下降。主要原因是云成本上升。";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    sourceId: "report-beilan",
    body,
    active: true,
    contentHash: contentHashOf(body),
    ...overrides,
  };
}

function claim(overrides: Partial<DraftClaim> = {}): DraftClaim {
  return {
    id: "c1",
    text: "北岚科技2026年第二季度毛利率为32.4%。",
    sourceId: "report-beilan",
    quote: "毛利率为32.4%，较上年同期下降",
    ...overrides,
  };
}

describe("硬校验", () => {
  test("原文子串通过，并记下原文起点", () => {
    const [result] = checkClaims([claim()], new Map([["report-beilan", source()]]));
    expect(result?.ok).toBe(true);
    expect(result?.quoteStart).toBe(body.indexOf("毛利率为32.4%"));
    expect(result?.failures).toEqual([]);
  });

  test("数字被篡改的 claim 只要引文是子串就通过硬校验", () => {
    const [result] = checkClaims(
      [claim({ text: "北岚科技2026年第二季度毛利率为23.4%。" })],
      new Map([["report-beilan", source()]]),
    );
    expect(result?.ok).toBe(true);
  });

  test("空白和弯引号可以匹配，大小写不能折", () => {
    const quotedBody = `${body}报道原文写着"云成本上升"。`;
    const spaced = claim({ quote: "毛利率为  32.4% ，较上年同期下降" });
    const curly = claim({
      id: "c2",
      quote: "\u201c云成本上升\u201d",
    });
    const sources = new Map<string, SourceRecord>([
      ["report-beilan", source({ body: quotedBody, contentHash: contentHashOf(quotedBody) })],
      [
        "en",
        {
          sourceId: "en",
          body: "Gross margin in Q2 was 32.4%.",
          active: true,
          contentHash: contentHashOf("Gross margin in Q2 was 32.4%."),
        },
      ],
    ]);
    const [spacedResult, curlyResult] = checkClaims([spaced, curly], sources);
    expect(spacedResult?.ok).toBe(true);
    expect(curlyResult?.quoteIsSubstring).toBe(true);

    const [caseResult] = checkClaims(
      [claim({ sourceId: "en", quote: "gross margin in q2 was 32.4%" })],
      sources,
    );
    expect(caseResult?.ok).toBe(false);
    expect(caseResult?.failures).toContain("quote");
  });

  test("引文不在原文、来源未注册、来源停用、哈希不符都失败", () => {
    const cases: Array<[DraftClaim, SourceRecord | undefined, string]> = [
      [claim({ quote: "毛利率上升了十个百分点" }), source(), "quote"],
      [claim({ sourceId: "missing" }), undefined, "source"],
      [claim(), source({ active: false }), "source"],
      [claim(), source({ contentHash: contentHashOf("被偷换的正文") }), "hash"],
    ];
    for (const [item, record, failure] of cases) {
      const sources = new Map<string, SourceRecord>();
      if (record) sources.set(item.sourceId === "missing" ? "report-beilan" : item.sourceId, record);
      if (item.sourceId !== "missing" && record) sources.set(item.sourceId, record);
      const [result] = checkClaims([item], sources);
      expect(result?.ok).toBe(false);
      expect(result?.failures).toContain(failure);
    }
  });

  test("过短引文和重复 claim id 不能通过", () => {
    const sources = new Map([["report-beilan", source()]]);
    const [short] = checkClaims([claim({ quote: "毛利率" })], sources);
    expect(short?.ok).toBe(false);
    expect(short?.failures).toContain("length");

    const [first, second] = checkClaims([claim({ id: "same" }), claim({ id: "same" })], sources);
    expect(first?.failures).toContain("duplicate");
    expect(second?.failures).toContain("duplicate");
    expect(first?.ok).toBe(false);
  });
});
