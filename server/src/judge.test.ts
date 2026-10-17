import { describe, expect, test } from "bun:test";
import { createModelJudge, parseJudgement } from "./judge.ts";
import { oursPrompt, PROMPT_VERSION } from "./prompts/ours.ts";
import type { SourceRecord } from "./hardChecks.ts";

describe("判定解析", () => {
  test("提示词写明三类和原子事实，版本号固定", () => {
    const prompt = oursPrompt({
      claim: "毛利率上升",
      quote: "毛利率下降",
      context: "毛利率下降",
    });
    expect(PROMPT_VERSION).toBe("ours-1");
    expect(prompt).toContain("原子事实");
    expect(prompt).toContain("CONTRADICTED");
    expect(prompt).toContain("不得判 SUPPORTED");
  });

  test("能解析代码块，并丢掉模型多给的金额字段", () => {
    const parsed = parseJudgement(
      '```json\n{"verdict":"CONTRADICTED","rationale":"原文是下降","supportingQuote":"毛利率下降","amount":"999999"}\n```',
    );
    expect(parsed.verdict).toBe("CONTRADICTED");
    expect(parsed.supportingQuote).toBe("毛利率下降");
    expect("amount" in parsed).toBe(false);
    expect(parseJudgement('{"verdict":"CONTRADICTED"}')).toEqual({
      verdict: "CONTRADICTED",
      rationale: "",
    });
    const long = "理".repeat(500);
    expect(parseJudgement(`{"verdict":"SUPPORTED","rationale":"${long}","supportingQuote":"${"引".repeat(600)}"}`).rationale).toHaveLength(400);
  });

  test("假接口返回矛盾判定", async () => {
    const source: SourceRecord = {
      sourceId: "news-caijing",
      body: "报道确认毛利率较去年同期下降。",
      active: true,
      contentHash: `0x${"ab".repeat(32)}`,
    };
    const judge = createModelJudge({
      apiKey: "test-key",
      model: "glm-4-flash",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.messages[0].content).toContain("毛利率上升");
        expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    verdict: "CONTRADICTED",
                    rationale: "原文是下降",
                    supportingQuote: "毛利率较去年同期下降",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    });
    const result = await judge({
      claim: {
        id: "c-flip",
        text: "毛利率上升",
        sourceId: "news-caijing",
        quote: "毛利率较去年同期下降",
      },
      source,
      method: "ours",
    });
    expect(result.verdict).toBe("CONTRADICTED");
  });

  test("连接中断时重试，第二次成功就采用", async () => {
    let calls = 0;
    const judge = createModelJudge({
      apiKey: "test-key",
      model: "glm-4-flash",
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new Error("socket closed");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    verdict: "SUPPORTED",
                    rationale: "原文写了私人生活安宁",
                    supportingQuote: "私人生活安宁",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    });
    const result = await judge({
      claim: {
        id: "c-ok",
        text: "隐私包括私人生活安宁",
        sourceId: "cc-1032",
        quote: "私人生活安宁",
      },
      source: {
        sourceId: "cc-1032",
        body: "隐私是自然人的私人生活安宁。",
        active: true,
        contentHash: `0x${"ab".repeat(32)}`,
      },
      method: "ours",
    });
    expect(calls).toBe(2);
    expect(result.verdict).toBe("SUPPORTED");
  });
});
