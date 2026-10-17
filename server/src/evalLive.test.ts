import { describe, expect, test } from "bun:test";
import { scoreLlmMethods } from "./evalLive.ts";
import type { Judge } from "./verify.ts";

describe("模型评测汇总", () => {
  test("失败记成未支持，优化核对能把说反的同意条款标成矛盾", async () => {
    const judge: Judge = async ({ claim, method }) => {
      if (claim.id === "cc-no-consent" && method === "ours") {
        return { verdict: "CONTRADICTED", rationale: "漏掉权利人明确同意" };
      }
      if (claim.id === "cc-peace" && method === "ours") throw new Error("超时");
      return { verdict: "SUPPORTED", rationale: "子串在", supportingQuote: claim.quote };
    };
    const summary = await scoreLlmMethods(judge);
    const ours = summary.methods.find((method) => method.id === "ours");
    const minimal = summary.methods.find((method) => method.id === "baselineB");
    expect(ours?.failures).toEqual(["cc-peace"]);
    expect(ours?.stillWrong).not.toContain("cc-no-consent");
    expect(minimal?.stillWrong).toContain("cc-no-consent");
    expect(summary.note).toContain("cc-peace");
  });
});
