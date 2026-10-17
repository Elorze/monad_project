import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { demoClaims, demoJudge, isDemoQuestion } from "./demo.ts";
import { recordedCloseTx, txForRecordedAction } from "./demoReceipts.ts";
import { evidenceHashOf } from "./evidence.ts";
import { PROMPT_VERSION } from "./judge.ts";
import { loadSources, priceMap, toSourceMap } from "./sources/registry.ts";
import { verifyClaims, type VerifyResult } from "./verify.ts";

const AnswerRequest = z.object({
  question: z.string().min(2).max(500),
  budget: z.string().regex(/^\d+$/u),
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

export function applyBudget(results: VerifyResult[], budget: string): {
  results: VerifyResult[];
  spent: string;
  refund: string;
} {
  let remaining = BigInt(budget);
  let spent = 0n;
  const next = results.map((result) => {
    if (result.action !== "PAID" || result.amount === undefined) return result;
    const amount = BigInt(result.amount);
    if (remaining < amount) {
      return {
        ...result,
        action: "SKIPPED" as const,
        amount: undefined,
        rationale: "预算不足，未付款",
      };
    }
    remaining -= amount;
    spent += amount;
    return result;
  });
  return { results: next, spent: spent.toString(), refund: remaining.toString() };
}

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

  app.post("/answer", async (c) => {
    const parsed = AnswerRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ message: "问题或预算格式不对" }, 400);
    if (!isDemoQuestion(parsed.data.question)) {
      return c.json({ message: "自由提问还没接上。先问北岚科技的毛利率。" }, 400);
    }

    const sources = await loadSources();
    const claims = demoClaims();
    const verified = await verifyClaims({
      claims,
      sources: toSourceMap(sources),
      prices: priceMap(sources),
      method: "ours",
      judge: demoJudge,
    });
    const settled = applyBudget(verified, parsed.data.budget);
    const answerId = "demo-beilan-q2";

    return streamSSE(c, async (stream) => {
      const answer = event({
        type: "answer",
        answerId,
        answer: "北岚科技2026年第二季度毛利率为32.4%，下降主要因为云基础设施成本上升。有一条说法把下降说成了上升。",
      });
      await stream.writeSSE({ data: JSON.stringify(answer) });
      for (const result of settled.results) {
        const claim = claims.find((item) => item.id === result.claimId);
        if (!claim) continue;
        const claimEvent = event({
          type: "claim",
          claimId: result.claimId,
          text: claim.text,
          quote: claim.quote,
          sourceId: claim.sourceId,
          verdict: result.verdict,
          action: result.action,
          amount: result.amount,
          rationale: result.rationale,
          txHash: txForRecordedAction(result.claimId, result.action),
          evidenceHash: evidenceHashOf({
            promptVersion: PROMPT_VERSION,
            claimId: result.claimId,
            text: claim.text,
            quote: claim.quote,
            verdict: result.verdict,
          }),
        });
        await stream.writeSSE({ data: JSON.stringify(claimEvent) });
      }
      await stream.writeSSE({
        data: JSON.stringify(
          event({
            type: "done",
            spent: settled.spent,
            refund: settled.refund,
            refundTx: recordedCloseTx(settled.results.map((result) => ({ claimId: result.claimId, action: result.action }))),
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
