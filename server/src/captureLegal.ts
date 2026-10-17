import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { createModelJudge } from "./judge.ts";
import { legalPrices, legalSourceMap, loadLegalPassages } from "./legalDemo.ts";
import { verifyClaims, type VerifyMethod } from "./verify.ts";

const ClaimSchema = z.object({
  text: z.string().min(4),
  sourceId: z.enum(["cc-1032", "cc-1033", "cc-1034", "cc-1035"]),
  quote: z.string().min(8),
});

const questions = [
  "读者说：只要法律没有另行规定，处理他人私密信息就可以不经权利人同意。请判断这句话，并引用原文。",
  "读者说：隐私只包括私密信息，不包括私人生活安宁。请判断这句话，并引用原文。",
  "读者说：侵害隐私权一律赔偿五万元。请判断这句话，并引用原文。",
];

function readDraft(content: string): { opinion: string; claims: z.infer<typeof ClaimSchema>[] } {
  const fenced = content.trim().match(/```(?:json)?\s*([\s\S]*?)```/u);
  let jsonText = fenced?.[1]?.trim() ?? content.trim();
  if (!jsonText.startsWith("{")) {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1);
  }
  const parsed = z
    .object({
      opinion: z.string().min(20),
      claims: z.array(z.record(z.string(), z.unknown())).min(1).max(4),
    })
    .parse(JSON.parse(jsonText));
  const claims = parsed.claims.map((item) => {
    const nested = z.array(z.record(z.string(), z.unknown())).safeParse(item.claims).data?.[0];
    const source = nested ?? item;
    return ClaimSchema.parse({
      text: item.text,
      sourceId: source.sourceId,
      quote: source.quote,
    });
  });
  return { opinion: parsed.opinion, claims };
}

const key = process.env.LLM_API_KEY;
if (!key) throw new Error("缺少 LLM_API_KEY");
const model = process.env.LLM_MODEL ?? "glm-4-flash";
const fromRaw = process.argv.includes("--from-raw");
let content = "";
if (fromRaw) {
  content = readFileSync(new URL("../../eval/capture-raw.txt", import.meta.url), "utf8");
} else {
  const passages = await loadLegalPassages();
  const material = passages.map((item) => `${item.title}（${item.sourceId}）\n${item.body}`).join("\n\n");
  const prompt = [
    "根据下面《民法典》原文，用一段话回答读者。直接给结论。",
    questions.join("\n"),
    "只输出 JSON，字段：opinion（整段意见），claims（1到4条）。",
    "每条 claim 含 text、sourceId、quote。sourceId 只能是 cc-1032、cc-1033、cc-1034、cc-1035。",
    "quote 必须是对应条文里连续抄下来的原句，至少 8 个字。text 写你的结论，不要只复述读者的原话。",
    material,
  ].join("\n");
  const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`生成失败：${response.status}`);
  const payload: unknown = await response.json();
  content =
    z
      .object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) })
      .parse(payload).choices[0]?.message.content ?? "";
  writeFileSync(new URL("../../eval/capture-raw.txt", import.meta.url), content);
}

const draft = readDraft(content);
const claims = draft.claims.map((claim, index) => ({ id: `z-${index + 1}`, ...claim }));
const verified = await verifyClaims({
  claims,
  sources: await legalSourceMap(),
  prices: legalPrices(),
  method: "ours" satisfies VerifyMethod,
  judge: createModelJudge({ apiKey: key, model }),
});
const judgements = verified.map((row) => {
  const claim = claims.find((item) => item.id === row.claimId);
  return {
    id: row.claimId,
    text: claim?.text ?? "",
    sourceId: claim?.sourceId ?? "",
    quote: claim?.quote ?? "",
    verdict: row.verdict,
    action: row.action,
    rationale: row.rationale,
    amount: row.amount ?? null,
  };
});
const captured = {
  model,
  ranAt: new Date().toISOString(),
  prompt: questions.join(" "),
  opinion: draft.opinion,
  claims: judgements,
};
writeFileSync(new URL("../../eval/captured-legal.json", import.meta.url), `${JSON.stringify(captured, null, 2)}\n`);
console.log(JSON.stringify({ opinion: captured.opinion, claims: judgements }, null, 2));
