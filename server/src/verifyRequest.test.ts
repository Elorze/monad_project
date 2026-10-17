import { describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { runVerifyAndSettle, readLastVerify } from "./verifyRequest.ts";

describe("核对并结算", () => {
  test("拼出来的引文不付，原文支持的才付，并写入 last-verify", async () => {
    const lastPath = new URL("../../eval/last-verify.json", import.meta.url);
    try {
      unlinkSync(lastPath);
    } catch {
      // 还没有上次结果
    }

    const result = await runVerifyAndSettle({
      answer: "隐私包括私人生活安宁。侵害隐私权一律赔偿五万元。",
      budget: "5000",
      method: "baselineA",
      sources: [
        {
          sourceId: "cc-1032",
          body: "自然人享有隐私权。隐私是自然人的私人生活安宁和不愿为他人知晓的私密空间、私密活动、私密信息。任何组织或者个人不得以刺探、侵扰、泄露、公开等方式侵害他人的隐私权。",
        },
      ],
      claims: [
        {
          id: "ok-peace",
          text: "隐私包括私人生活安宁。",
          sourceId: "cc-1032",
          quote: "私人生活安宁和不愿为他人知晓的私密空间、私密活动、私密信息",
        },
        {
          id: "fake-quote",
          text: "侵害隐私权一律赔偿五万元。",
          sourceId: "cc-1032",
          quote: "侵害隐私权一律赔偿五万元",
        },
      ],
    });

    expect(result.claims.find((item) => item.claimId === "ok-peace")).toMatchObject({
      verdict: "SUPPORTED",
      paid: true,
      action: "PAID",
      amount: "1000",
    });
    expect(result.claims.find((item) => item.claimId === "fake-quote")).toMatchObject({
      verdict: "UNSUPPORTED",
      paid: false,
      action: "SKIPPED",
    });
    expect(result.spent).toBe("1000");
    expect(readLastVerify()?.answerId).toBe(result.answerId);
  });
});
