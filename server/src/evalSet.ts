import { readFileSync } from "node:fs";
import { z } from "zod";
import { loadSources } from "./sources/registry.ts";
import { surfaceConflict } from "./surface.ts";

const CaseSchema = z.object({
  id: z.string(),
  category: z.string(),
  sourceId: z.string(),
  claim: z.string(),
  quote: z.string(),
  gold: z.enum(["SUPPORTED", "CONTRADICTED", "UNSUPPORTED"]),
});

export type EvalCase = z.infer<typeof CaseSchema>;

export function loadEvalCases(): EvalCase[] {
  const file = new URL("../../eval/cases.json", import.meta.url);
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  return z.array(CaseSchema).parse(raw);
}

export type Prediction = "SUPPORTED" | "CONTRADICTED" | "UNSUPPORTED";

export function baselineA(quoteInSource: boolean): Prediction {
  return quoteInSource ? "SUPPORTED" : "UNSUPPORTED";
}

export function rulesThenSubstring(item: EvalCase, quoteInSource: boolean): Prediction {
  if (!quoteInSource) return "UNSUPPORTED";
  return surfaceConflict(item.claim, item.quote) ?? "SUPPORTED";
}

export function mispaymentRate(rows: Array<{ predicted: Prediction; gold: Prediction }>): number {
  const paid = rows.filter((row) => row.predicted === "SUPPORTED");
  if (paid.length === 0) return 0;
  const wrong = paid.filter((row) => row.gold !== "SUPPORTED").length;
  return wrong / paid.length;
}

export function paymentCounts(rows: Array<{ predicted: Prediction; gold: Prediction }>): { paid: number; wrong: number } {
  const paid = rows.filter((row) => row.predicted === "SUPPORTED");
  return { paid: paid.length, wrong: paid.filter((row) => row.gold !== "SUPPORTED").length };
}

export async function buildEvalSummary() {
  const cases = loadEvalCases();
  const sources = await loadSources();
  const byId = new Map(sources.map((source) => [source.sourceId, source.body]));
  const score = (predict: (item: EvalCase, present: boolean) => Prediction) => {
    const rows = cases.map((item) => {
      const present = byId.get(item.sourceId)?.includes(item.quote) ?? false;
      return { predicted: predict(item, present), gold: item.gold, category: item.category, id: item.id };
    });
    const counts = paymentCounts(rows);
    return {
      mispayment: mispaymentRate(rows),
      paid: counts.paid,
      wrong: counts.wrong,
      stillWrong: rows.filter((row) => row.predicted === "SUPPORTED" && row.gold !== "SUPPORTED").map((row) => row.category),
    };
  };
  return {
    caseCount: cases.length,
    chain: false,
    methods: [
      { id: "baselineA", name: "仅子串", ...score((_item, present) => baselineA(present)) },
      { id: "rules", name: "数字与方向规则", ...score((item, present) => rulesThenSubstring(item, present)) },
    ],
    omitted: "优化模型还没有在这 21 条上整集跑完，所以表里不填那一列。",
  };
}
