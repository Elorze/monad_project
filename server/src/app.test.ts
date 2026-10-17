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

  test("演示问题返回三条查得到的付款，其中两条有已经终局的交易", async () => {
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
      ["c-subscription", "SUPPORTED", "PAID"],
    ]);
    expect(String(claims[0]?.txHash)).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(String(claims[1]?.txHash)).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(claims[2]?.txHash).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ type: "done", spent: "3000", refund: "2000" });
    expect(events.at(-1)?.refundTx).toBeUndefined();
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

  test("法律样例里说反的那条引文是原文，但不付款，也不冒充链上交易", async () => {
    const app = createApp();
    const response = await app.request("/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sample: "legal", budget: "5000" }),
    });
    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    const guardian = events.find((item) => item.claimId === "l-secret");
    const contract = events.find((item) => item.claimId === "l-consent");
    expect(guardian).toMatchObject({ verdict: "CONTRADICTED", action: "FLAGGED" });
    expect(guardian?.txHash).toBeUndefined();
    expect(guardian?.amount).toBeUndefined();
    expect(String(guardian?.quote)).toContain("权利人明确同意");
    expect(contract).toMatchObject({ verdict: "SUPPORTED", action: "PAID" });
    expect(contract?.txHash).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ spent: "2000" });
  });

  test("评测表用实跑的误付率，不预填模型那一列", async () => {
    const app = createApp();
    const response = await app.request("/eval");
    const body = (await response.json()) as {
      caseCount: number;
      chain: boolean;
      omitted: string;
      methods: Array<{ name: string; mispayment: number; wrong: number }>;
    };
    expect(body.caseCount).toBe(30);
    expect(body.chain).toBe(false);
    const baseline = body.methods.find((method) => method.name === "仅子串");
    const rules = body.methods.find((method) => method.name === "数字与方向规则");
    expect(baseline?.wrong).toBe(18);
    expect(baseline?.mispayment).toBeGreaterThan(rules?.mispayment ?? 1);
    if (body.methods.length === 2) expect(body.omitted).toContain("不填");
  });
});
