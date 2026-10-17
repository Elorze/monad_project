import { describe, expect, test } from "bun:test";
import { loadSources } from "./sources/registry.ts";
import { baselineA, loadEvalCases, mispaymentRate, rulesThenSubstring } from "./evalSet.ts";

describe("标注集", () => {
  test("覆盖文档里的类别，伪造引文不在原文里，其余引文都是子串", async () => {
    const cases = loadEvalCases();
    const counts = new Map<string, number>();
    for (const item of cases) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    expect(counts).toEqual(
      new Map([
        ["正确支持", 8],
        ["数字篡改", 3],
        ["方向反转", 3],
        ["断章取义", 7],
        ["相关但未说", 5],
        ["伪造引文", 2],
        ["转载站归因", 2],
      ]),
    );

    const sources = await loadSources();
    const byId = new Map(sources.map((source) => [source.sourceId, source]));
    for (const item of cases) {
      const source = byId.get(item.sourceId);
      expect(source).toBeDefined();
      const present = source?.body.includes(item.quote) ?? false;
      expect(present).toBe(item.category !== "伪造引文");
      if (item.category === "转载站归因") expect(source?.isOriginal).toBe(false);
    }
  });

  test("只看子串会付掉全部带星号的错例；数字和方向规则能少付，但断章取义仍然会付", async () => {
    const cases = loadEvalCases();
    const sources = await loadSources();
    const byId = new Map(sources.map((source) => [source.sourceId, source]));
    const baselineRows = cases.map((item) => {
      const present = byId.get(item.sourceId)?.body.includes(item.quote) ?? false;
      return { ...item, predicted: baselineA(present) };
    });
    const ruleRows = cases.map((item) => {
      const present = byId.get(item.sourceId)?.body.includes(item.quote) ?? false;
      return { ...item, predicted: rulesThenSubstring(item, present) };
    });

    const baselineMispay = mispaymentRate(baselineRows);
    const ruleMispay = mispaymentRate(ruleRows);
    expect(baselineMispay).toBeGreaterThan(ruleMispay);

    for (const item of baselineRows.filter((row) => ["数字篡改", "方向反转", "断章取义", "相关但未说"].includes(row.category))) {
      expect(item.predicted).toBe("SUPPORTED");
    }
    for (const item of ruleRows.filter((row) => row.category === "数字篡改" || row.category === "方向反转")) {
      expect(item.predicted).toBe("CONTRADICTED");
    }
    for (const item of ruleRows.filter((row) => row.category === "断章取义")) {
      expect(item.predicted).toBe("SUPPORTED");
    }
    for (const item of ruleRows.filter((row) => row.category === "伪造引文")) {
      expect(item.predicted).toBe("UNSUPPORTED");
    }
    for (const item of ruleRows.filter((row) => row.category === "正确支持" || row.category === "转载站归因")) {
      expect(item.predicted).toBe("SUPPORTED");
    }
  });
});
