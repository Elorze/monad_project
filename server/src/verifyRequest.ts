import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { contentHashOf, type DraftClaim, type SourceRecord } from "./hardChecks.ts";
import { evidenceHashOf } from "./evidence.ts";
import { createModelJudge, PROMPT_VERSION } from "./judge.ts";
import { applyBudget } from "./budget.ts";
import { settleIfConfigured } from "./chain/liveSettle.ts";
import { verifyClaims, type Judge, type VerifyMethod } from "./verify.ts";

export type VerifySourceInput = {
  sourceId: string;
  title?: string;
  body: string;
};

export type VerifyClaimInput = {
  id?: string;
  text: string;
  sourceId: string;
  quote: string;
};

export type VerifyAndSettleInput = {
  sources: VerifySourceInput[];
  answer: string;
  claims: VerifyClaimInput[];
  budget?: string;
  method?: VerifyMethod;
};

export type ClaimSettlement = {
  claimId: string;
  text: string;
  sourceId: string;
  quote: string;
  verdict: "SUPPORTED" | "CONTRADICTED" | "UNSUPPORTED";
  action: "PAID" | "FLAGGED" | "SKIPPED";
  paid: boolean;
  amount?: string;
  rationale: string;
  evidenceHash: string;
  txHash?: string;
};

export type VerifyAndSettleResult = {
  answerId: string;
  answer: string;
  sources: Array<{ sourceId: string; title: string; body: string }>;
  spent: string;
  refund: string;
  refundTx?: string;
  claims: ClaimSettlement[];
  savedAt: string;
  via: "mcp";
};

const LAST_FILE = new URL("../../eval/last-verify.json", import.meta.url);

export async function runVerifyAndSettle(input: VerifyAndSettleInput): Promise<VerifyAndSettleResult> {
  if (input.sources.length === 0) throw new Error("至少提供一段原文");
  if (input.claims.length === 0) throw new Error("至少提供一条带引文的说法");

  const sources = new Map<string, SourceRecord>();
  for (const source of input.sources) {
    const body = source.body.replace(/\r\n/g, "\n").trim();
    sources.set(source.sourceId, {
      sourceId: source.sourceId,
      body,
      active: true,
      contentHash: contentHashOf(body),
    });
  }

  const claims: DraftClaim[] = input.claims.map((claim, index) => ({
    id: claim.id?.trim() || `m-${index + 1}`,
    text: claim.text,
    sourceId: claim.sourceId,
    quote: claim.quote,
  }));

  const prices = new Map(input.sources.map((source) => [source.sourceId, "1000"]));
  const method: VerifyMethod = input.method ?? "ours";
  const judge = await pickJudge(method);
  const verified = await verifyClaims({ claims, sources, prices, method, judge });
  const budget = input.budget ?? "5000";
  const settled = applyBudget(verified, budget);
  const answerId = `mcp-${Date.now()}`;

  const claimRows: ClaimSettlement[] = settled.results.map((result) => {
    const claim = claims.find((item) => item.id === result.claimId)!;
    const evidenceHash = evidenceHashOf({
      promptVersion: PROMPT_VERSION,
      claimId: result.claimId,
      text: claim.text,
      quote: claim.quote,
      verdict: result.verdict,
    });
    return {
      claimId: result.claimId,
      text: claim.text,
      sourceId: claim.sourceId,
      quote: claim.quote,
      verdict: result.verdict,
      action: result.action,
      paid: result.action === "PAID",
      amount: result.amount,
      rationale: result.rationale,
      evidenceHash,
    };
  });

  const paid = claimRows.filter((row) => row.action === "PAID" && row.evidenceHash.startsWith("0x"));
  const receipts = await settleIfConfigured({
    answerId,
    budget: BigInt(budget),
    claims: paid.map((row) => ({
      claimId: row.claimId,
      sourceId: row.sourceId,
      body: sources.get(row.sourceId)?.body ?? "",
      evidenceHash: row.evidenceHash as `0x${string}`,
    })),
  });
  if (receipts) {
    for (const row of claimRows) {
      const hash = receipts.txByClaim[row.claimId];
      if (hash) row.txHash = hash;
    }
  }

  const output: VerifyAndSettleResult = {
    answerId,
    answer: input.answer,
    sources: input.sources.map((source) => ({
      sourceId: source.sourceId,
      title: source.title ?? source.sourceId,
      body: source.body.replace(/\r\n/g, "\n").trim(),
    })),
    spent: settled.spent,
    refund: settled.refund,
    refundTx: receipts?.closeTx,
    claims: claimRows,
    savedAt: new Date().toISOString(),
    via: "mcp",
  };
  saveLastVerify(output);
  return output;
}

export function saveLastVerify(result: VerifyAndSettleResult): void {
  writeFileSync(LAST_FILE, `${JSON.stringify(result, null, 2)}\n`);
}

export function readLastVerify(): VerifyAndSettleResult | null {
  if (!existsSync(LAST_FILE)) return null;
  try {
    return JSON.parse(readFileSync(LAST_FILE, "utf8")) as VerifyAndSettleResult;
  } catch {
    return null;
  }
}

async function pickJudge(method: VerifyMethod): Promise<Judge | undefined> {
  if (method === "baselineA") return undefined;
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("未配置 LLM_API_KEY，不能把「引文在原文里」当成支持");
  return createModelJudge({
    apiKey,
    model: process.env.LLM_MODEL ?? "glm-4-flash",
  });
}
