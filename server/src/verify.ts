import { checkClaims, quoteAppearsIn, type DraftClaim, type HardCheckResult, type SourceRecord } from "./hardChecks.ts";

export type Verdict = "SUPPORTED" | "CONTRADICTED" | "UNSUPPORTED";
export type VerifyMethod = "baselineA" | "baselineB" | "ours";

export type Judgement = {
  verdict: Verdict;
  rationale: string;
  supportingQuote?: string;
};

export type VerifyResult = {
  claimId: string;
  verdict: Verdict;
  rationale: string;
  hardChecks: HardCheckResult;
  action: "PAID" | "FLAGGED" | "SKIPPED";
  amount?: string;
};

export type Judge = (input: {
  claim: DraftClaim;
  source: SourceRecord;
  method: VerifyMethod;
}) => Promise<Judgement>;

export async function verifyClaims(input: {
  claims: DraftClaim[];
  sources: ReadonlyMap<string, SourceRecord>;
  prices: ReadonlyMap<string, string>;
  method: VerifyMethod;
  judge?: Judge;
}): Promise<VerifyResult[]> {
  const checks = checkClaims(input.claims, input.sources);
  const results: VerifyResult[] = [];
  for (let i = 0; i < input.claims.length; i++) {
    const claim = input.claims[i];
    const hard = checks[i];
    if (!claim || !hard) continue;
    results.push(await verifyOne(claim, hard, input));
  }
  return results;
}

async function verifyOne(
  claim: DraftClaim,
  hard: HardCheckResult,
  input: {
    sources: ReadonlyMap<string, SourceRecord>;
    prices: ReadonlyMap<string, string>;
    method: VerifyMethod;
    judge?: Judge;
  },
): Promise<VerifyResult> {
  if (!hard.ok) {
    return {
      claimId: claim.id,
      verdict: "UNSUPPORTED",
      rationale: "硬校验未通过，不调用判定模型",
      hardChecks: hard,
      action: "SKIPPED",
    };
  }

  if (input.method === "baselineA") {
    return paidOrSkipped(claim, hard, "SUPPORTED", "引文是原文子串", input.prices);
  }

  const source = input.sources.get(claim.sourceId);
  if (!source || !input.judge) {
    return {
      claimId: claim.id,
      verdict: "UNSUPPORTED",
      rationale: "没有判定器",
      hardChecks: hard,
      action: "SKIPPED",
    };
  }

  let judgement: Judgement;
  try {
    judgement = await input.judge({ claim, source, method: input.method });
  } catch {
    return {
      claimId: claim.id,
      verdict: "UNSUPPORTED",
      rationale: "判定模型失败，按未支持处理",
      hardChecks: hard,
      action: "SKIPPED",
    };
  }

  const verdict = applyQuoteRule(input.method, judgement, source.body);
  const rationale = verdict === judgement.verdict ? judgement.rationale : "支持性引文未通过子串校验，降级为未支持";
  if (verdict === "SUPPORTED") return paidOrSkipped(claim, hard, verdict, rationale, input.prices);
  if (verdict === "CONTRADICTED") {
    return { claimId: claim.id, verdict, rationale, hardChecks: hard, action: "FLAGGED" };
  }
  return { claimId: claim.id, verdict: "UNSUPPORTED", rationale, hardChecks: hard, action: "SKIPPED" };
}

function applyQuoteRule(method: VerifyMethod, judgement: Judgement, body: string): Verdict {
  if (judgement.verdict !== "SUPPORTED") return judgement.verdict;
  if (method === "ours" && !judgement.supportingQuote) return "UNSUPPORTED";
  if (judgement.supportingQuote && !quoteAppearsIn(body, judgement.supportingQuote)) return "UNSUPPORTED";
  return "SUPPORTED";
}

function paidOrSkipped(
  claim: DraftClaim,
  hard: HardCheckResult,
  verdict: Verdict,
  rationale: string,
  prices: ReadonlyMap<string, string>,
): VerifyResult {
  const amount = prices.get(claim.sourceId);
  if (!amount) {
    return { claimId: claim.id, verdict: "UNSUPPORTED", rationale: "来源没有单价", hardChecks: hard, action: "SKIPPED" };
  }
  return { claimId: claim.id, verdict, rationale, hardChecks: hard, action: "PAID", amount };
}
