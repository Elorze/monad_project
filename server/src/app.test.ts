import { describe, expect, test } from "bun:test";
import { applyBudget, createApp } from "./app.ts";
import type { VerifyResult } from "./verify.ts";

function parseSse(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()) as Record<string, unknown>);
}

const paid = (id: string): VerifyResult => ({
  claimId: id,
  verdict: "SUPPORTED",
  rationale: "支持",
  action: "PAID",
  amount: "1000",
  hardChecks: {
    claimId: id,
    ok: true,
    sourceRegistered: true,
    quoteIsSubstring: true,
    contentHashMatches: true,
    failures: [],
  },
});

describe("回答接口", () => {
  test("预算只够一条时，第二条支持的说法不付款", () => {
    const { results, spent, refund } = applyBudget([paid("a"), paid("b")], "1000");
    expect(results[0]?.action).toBe("PAID");
    expect(results[1]?.action).toBe("SKIPPED");
    expect(results[1]?.amount).toBeUndefined();
    expect(spent).toBe("1000");
    expect(refund).toBe("0");
  });

  test("演示问题流式返回两笔付款和一笔矛盾标记", async () => {
    const app = createApp();
    const response = await app.request("/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "北岚科技2026年第二季度毛利率是多少？主要驱动是什么？",
        budget: "5000",
      }),
    });
    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    expect(events[0]?.type).toBe("answer");
    const claims = events.filter((item) => item.type === "claim");
    expect(claims.map((item) => [item.claimId, item.verdict, item.action])).toEqual([
      ["c-margin", "SUPPORTED", "PAID"],
      ["c-driver", "SUPPORTED", "PAID"],
      ["c-flip", "CONTRADICTED", "FLAGGED"],
    ]);
    expect(claims[2]).not.toHaveProperty("amount");
    expect(String(claims[0]?.evidenceHash)).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(String(claims[0]?.txHash)).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(String(claims[2]?.txHash)).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(events.at(-1)).toMatchObject({ type: "done", spent: "2000", refund: "3000" });
    expect(String(events.at(-1)?.refundTx)).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  test("预算不够时不把已经付过的第二笔交易安到这次头上", async () => {
    const app = createApp();
    const response = await app.request("/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "北岚科技毛利率是多少",
        budget: "1000",
      }),
    });
    const events = parseSse(await response.text());
    const driver = events.find((item) => item.claimId === "c-driver");
    expect(driver?.action).toBe("SKIPPED");
    expect(driver?.txHash).toBeUndefined();
    expect(events.at(-1)?.refundTx).toBeUndefined();
  });

  test("无关问题被拒绝，不假装已经生成答案", async () => {
    const app = createApp();
    const response = await app.request("/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "今天上海天气怎么样", budget: "5000" }),
    });
    expect(response.status).toBe(400);
  });
});
