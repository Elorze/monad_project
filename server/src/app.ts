import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { demoClaims, demoJudge, isDemoQuestion } from "./demo.ts";
import { recordedCloseTx, txForRecordedAction } from "./demoReceipts.ts";
import { evidenceHashOf } from "./evidence.ts";
import { buildEvalSummary } from "./evalSet.ts";
import { PROMPT_VERSION } from "./judge.ts";
import { LEGAL_DISCLAIMER, LEGAL_OPINION, legalClaims, legalJudge, legalPrices, legalSourceMap, loadLegalPassages } from "./legalDemo.ts";
import { loadSources, priceMap, toSourceMap } from "./sources/registry.ts";
import { applyBudget } from "./budget.ts";
import { readLastVerify, runVerifyAndSettle } from "./verifyRequest.ts";
import { verifyClaims } from "./verify.ts";

export { applyBudget } from "./budget.ts";

const AnswerRequest = z.object({
  question: z.string().min(2).max(500).optional(),
  sample: z.enum(["legal", "report"]).optional(),
  budget: z.string().regex(/^\d+$/u),
});

const VerifyRequest = z.object({
  sources: z
    .array(
      z.object({
        sourceId: z.string().min(1),
        title: z.string().optional(),
        body: z.string().min(1),
      }),
    )
    .min(1),
  answer: z.string().min(1),
  claims: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string().min(1),
        sourceId: z.string().min(1),
        quote: z.string().min(1),
      }),
    )
    .min(1),
  budget: z.string().regex(/^\d+$/u).optional(),
  method: z.enum(["baselineA", "baselineB", "ours"]).optional(),
});

const SseEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("answer"),
    answerId: z.string(),
    answer: z.string(),
  }),
  z.object({
    type: z.literal("claim"),
    claimId: z.string(),
    text: z.string(),
    quote: z.string(),
    sourceId: z.string(),
    verdict: z.enum(["SUPPORTED", "CONTRADICTED", "UNSUPPORTED"]),
    action: z.enum(["PAID", "FLAGGED", "SKIPPED"]),
    amount: z.string().optional(),
    rationale: z.string(),
    evidenceHash: z.string(),
    txHash: z.string().optional(),
  }),
  z.object({
    type: z.literal("done"),
    spent: z.string(),
    refund: z.string(),
    refundTx: z.string().optional(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type AnswerEvent = z.infer<typeof SseEvent>;

export function createApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/sources", async (c) => {
    const sources = await loadSources();
    return c.json(
      sources.map((source) => ({
        sourceId: source.sourceId,
        title: source.title,
        publisher: source.publisher,
        isOriginal: source.isOriginal,
        payee: source.payee,
        pricePerClaim: source.pricePerClaim,
        contentHash: source.contentHash,
      })),
    );
  });

  app.get("/eval", async (c) => c.json(await buildEvalSummary()));

  app.get("/last-verify", (c) => {
    const last = readLastVerify();
    if (!last) return c.json({ message: "还没有 MCP 核对结果" }, 404);
    return c.json(last);
  });

  app.post("/verify", async (c) => {
    const parsed = VerifyRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ message: "sources、answer、claims 格式不对" }, 400);
    try {
      const result = await runVerifyAndSettle(parsed.data);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "核对失败";
      return c.json({ message }, 400);
    }
  });

  app.get("/samples", async (c) => {
    const sources = await loadSources();
    const reportIds = new Set(["report-beilan", "news-caijing", "reprint-aggregator"]);
    return c.json({
      legal: {
        id: "legal",
        title: "法律意见样例",
        disclaimer: LEGAL_DISCLAIMER,
        passages: (await loadLegalPassages()).map((passage) => ({ ...passage, isOriginal: true })),
        opinion: LEGAL_OPINION,
      },
      report: {
        id: "report",
        title: "研报样例",
        disclaimer: "北岚科技和这些材料是虚构的，用来演示出版商审计，不是投资建议。",
        passages: sources
          .filter((source) => reportIds.has(source.sourceId))
          .map((source) => ({
            sourceId: source.sourceId,
            title: source.title,
            body: source.body,
            isOriginal: source.isOriginal,
          })),
        opinion:
          "北岚科技2026年第二季度毛利率为32.4%，较上年同期下降。主要原因是云基础设施成本上升。订阅收入同比增长18%，但没有抵消成本压力。",
      },
    });
  });

  app.post("/answer", async (c) => {
    const parsed = AnswerRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ message: "问题或预算格式不对" }, 400);
    const sample = parsed.data.sample ?? (isDemoQuestion(parsed.data.question ?? "") ? "report" : undefined);
    if (!sample) return c.json({ message: "先选择法律意见或研报样例。" }, 400);

    const legal = sample === "legal";
    const sources = legal ? await legalSourceMap() : toSourceMap(await loadSources());
    const claims = legal ? legalClaims() : demoClaims();
    const verified = await verifyClaims({
      claims,
      sources,
      prices: legal ? legalPrices() : priceMap(await loadSources()),
      method: "ours",
      judge: legal ? legalJudge : demoJudge,
    });
    const settled = applyBudget(verified, parsed.data.budget);
    const answerId = legal ? "demo-statute" : "demo-beilan-q2";
    const answer = legal
      ? LEGAL_OPINION
      : "北岚科技2026年第二季度毛利率为32.4%，较上年同期下降。主要原因是云基础设施成本上升。订阅收入同比增长18%，但没有抵消成本压力。";

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify(event({ type: "answer", answerId, answer })) });
      for (const result of settled.results) {
        const claim = claims.find((item) => item.id === result.claimId);
        if (!claim) continue;
        await stream.writeSSE({
          data: JSON.stringify(
            event({
              type: "claim",
              claimId: result.claimId,
              text: claim.text,
              quote: claim.quote,
              sourceId: claim.sourceId,
              verdict: result.verdict,
              action: result.action,
              amount: result.amount,
              rationale: result.rationale,
              txHash: legal ? undefined : txForRecordedAction(result.claimId, result.action),
              evidenceHash: evidenceHashOf({
                promptVersion: PROMPT_VERSION,
                claimId: result.claimId,
                text: claim.text,
                quote: claim.quote,
                verdict: result.verdict,
              }),
            }),
          ),
        });
      }
      await stream.writeSSE({
        data: JSON.stringify(
          event({
            type: "done",
            spent: settled.spent,
            refund: settled.refund,
            refundTx: legal
              ? undefined
              : recordedCloseTx(settled.results.map((result) => ({ claimId: result.claimId, action: result.action }))),
          }),
        ),
      });
    });
  });

  return app;
}

function event(input: AnswerEvent): AnswerEvent {
  return SseEvent.parse(input);
}
