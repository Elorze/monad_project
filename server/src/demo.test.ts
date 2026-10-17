import { describe, expect, test } from "bun:test";
import { demoClaims, demoJudge, isDemoQuestion } from "./demo.ts";
import { loadSources, priceMap, toSourceMap } from "./sources/registry.ts";
import { verifyClaims } from "./verify.ts";

describe("演示问题", () => {
  test("北岚毛利率问题固定为两笔支持、一笔说反了", async () => {
    expect(isDemoQuestion("北岚科技2026年第二季度毛利率是多少？主要驱动是什么？")).toBe(true);
    const sources = await loadSources();
    const claims = demoClaims();
    for (const claim of claims) {
      const source = sources.find((item) => item.sourceId === claim.sourceId);
      expect(source?.body.includes(claim.quote)).toBe(true);
    }

    const judged = await verifyClaims({
      claims,
      sources: toSourceMap(sources),
      prices: priceMap(sources),
      method: "ours",
      judge: demoJudge,
    });
    expect(judged.map((item) => [item.claimId, item.verdict, item.action, item.amount])).toEqual([
      ["c-margin", "SUPPORTED", "PAID", "1000"],
      ["c-driver", "SUPPORTED", "PAID", "1000"],
      ["c-flip", "CONTRADICTED", "FLAGGED", undefined],
    ]);

    const baseline = await verifyClaims({
      claims,
      sources: toSourceMap(sources),
      prices: priceMap(sources),
      method: "baselineA",
    });
    expect(baseline.every((item) => item.action === "PAID")).toBe(true);
  });
});
