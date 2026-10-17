import { describe, expect, test } from "bun:test";
import { contentHashOf } from "../hardChecks.ts";
import { loadSources } from "./registry.ts";

describe("来源库", () => {
  test("中文来源都能加载，转载站不是原创，哈希对得上正文", async () => {
    const sources = await loadSources();
    expect(sources.map((source) => source.sourceId)).toEqual([
      "report-beilan",
      "news-caijing",
      "reprint-aggregator",
      "logistics",
      "cc-1032",
      "cc-1033",
      "cc-1034",
      "cc-1035",
    ]);
    const reprint = sources.find((source) => source.sourceId === "reprint-aggregator");
    expect(reprint?.isOriginal).toBe(false);
    expect(reprint?.title).toContain("回升");
    expect(reprint?.body).toContain("下降");
    for (const source of sources) {
      expect(source.active).toBe(true);
      expect(source.contentHash).toBe(contentHashOf(source.body));
      expect(source.pricePerClaim).toBe("1000");
      expect(source.body.length).toBeGreaterThan(20);
    }
  });
});
