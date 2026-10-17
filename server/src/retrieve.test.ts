import { describe, expect, test } from "bun:test";
import { loadSources } from "./sources/registry.ts";
import { retrieve } from "./retrieve.ts";

describe("检索", () => {
  test("毛利率问题命中北岚研报，运价问题命中物流，无关问题没有结果", async () => {
    const sources = await loadSources();
    const margin = retrieve("北岚科技2026年第二季度毛利率是多少", sources);
    expect(margin[0]?.sourceId).toBe("report-beilan");
    expect(margin.some((source) => source.sourceId === "logistics")).toBe(false);

    const freight = retrieve("港湾物流远洋运价为什么下跌", sources);
    expect(freight[0]?.sourceId).toBe("logistics");

    expect(retrieve("量子刺绣工坊的针法口诀", sources)).toEqual([]);
  });
});
