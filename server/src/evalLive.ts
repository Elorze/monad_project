import { writeFileSync } from "node:fs";
import { contentHashOf, type SourceRecord } from "./hardChecks.ts";
import { createModelJudge } from "./judge.ts";
import { loadEvalCases, mispaymentRate, paymentCounts, type EvalCase, type Prediction } from "./evalSet.ts";
import { loadSources } from "./sources/registry.ts";
import { verifyClaims, type Judge, type VerifyMethod } from "./verify.ts";

const NAMES: Record<"baselineB" | "ours", string> = {
  baselineB: "最小提示",
  ours: "优化核对",
};

export async function scoreLlmMethods(judge: Judge): Promise<{
  note: string;
  methods: Array<{
    id: string;
    name: string;
    mispayment: number;
    paid: number;
    wrong: number;
    stillWrong: string[];
    failures: string[];
  }>;
}> {
  const cases = loadEvalCases();
  const sources = await loadSources();
  const sourceMap = new Map<string, SourceRecord>(
    sources.map((source) => [
      source.sourceId,
      { sourceId: source.sourceId, body: source.body, active: source.active, contentHash: contentHashOf(source.body) },
    ]),
  );
  const prices = new Map(sources.map((source) => [source.sourceId, source.pricePerClaim]));
  const methods = [];
  for (const method of ["baselineB", "ours"] as const) {
    const rows = await mapPool(cases, 3, (item) => scoreOne(item, method, judge, sourceMap, prices));
    const counts = paymentCounts(rows);
    methods.push({
      id: method,
      name: NAMES[method],
      mispayment: mispaymentRate(rows),
      paid: counts.paid,
      wrong: counts.wrong,
      stillWrong: rows.filter((row) => row.predicted === "SUPPORTED" && row.gold !== "SUPPORTED").map((row) => row.id),
      failures: rows.filter((row) => row.failed).map((row) => row.id),
    });
  }
  const failed = methods.flatMap((method) => method.failures.map((id) => `${method.name}:${id}`));
  return {
    note: failed.length > 0 ? `模型失败已按未支持计入，没有另填分数：${failed.join("、")}` : "三列都是这次实跑，没有预填。",
    methods,
  };
}

async function scoreOne(
  item: EvalCase,
  method: VerifyMethod,
  judge: Judge,
  sources: Map<string, SourceRecord>,
  prices: Map<string, string>,
): Promise<{ predicted: Prediction; gold: Prediction; failed: boolean; id: string }> {
  const [row] = await verifyClaims({
    claims: [{ id: item.id, text: item.claim, sourceId: item.sourceId, quote: item.quote }],
    sources,
    prices,
    method,
    judge,
  });
  const failed = row?.rationale.includes("判定模型失败") ?? true;
  return { id: item.id, predicted: row?.verdict ?? "UNSUPPORTED", gold: item.gold, failed };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

const live = process.argv[1]?.replaceAll("\\", "/").endsWith("evalLive.ts") ?? false;
if (live) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("缺少 LLM_API_KEY");
  const model = process.env.LLM_MODEL ?? "glm-4-flash";
  const summary = await scoreLlmMethods(createModelJudge({ apiKey, model }));
  const file = new URL("../../eval/results.json", import.meta.url);
  writeFileSync(file, `${JSON.stringify({ model, ranAt: new Date().toISOString(), ...summary }, null, 2)}\n`);
  console.log(JSON.stringify({ model, note: summary.note, methods: summary.methods.map(({ id, mispayment, paid, wrong, failures }) => ({ id, mispayment, paid, wrong, failures })) }));
}
