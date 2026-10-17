import { contentHashOf, type DraftClaim, type SourceRecord } from "./hardChecks.ts";
import type { Judge, Judgement } from "./verify.ts";

export const LEGAL_DISCLAIMER =
  "法条摘自《中华人民共和国民法典》公开文本第1032条至第1035条。中间这段意见是事先写好的演示错例，不是某家模型的实测输出，也不是法律意见。";

const FILES = [
  { sourceId: "cc-1032", title: "民法典第1032条", file: "cc-1032.md" },
  { sourceId: "cc-1033", title: "民法典第1033条", file: "cc-1033.md" },
  { sourceId: "cc-1034", title: "民法典第1034条", file: "cc-1034.md" },
  { sourceId: "cc-1035", title: "民法典第1035条", file: "cc-1035.md" },
] as const;

export const LEGAL_OPINION =
  "自然人享有隐私权。处理他人的私密信息，只要法律没有另行规定，就不需要权利人同意。处理个人信息，应当征得该自然人或者其监护人同意，但是法律、行政法规另有规定的除外。";

const JUDGEMENTS: Record<string, Judgement> = {
  "l-privacy": {
    verdict: "SUPPORTED",
    rationale: "第1032条写明自然人享有隐私权。",
    supportingQuote: "自然人享有隐私权",
  },
  "l-secret": {
    verdict: "CONTRADICTED",
    rationale: "引文是第1033条原句。原句要求法律另有规定或者权利人明确同意，意见漏掉了权利人同意。",
    supportingQuote: "除法律另有规定或者权利人明确同意外",
  },
  "l-consent": {
    verdict: "SUPPORTED",
    rationale: "第1035条要求征得该自然人或者其监护人同意，法律、行政法规另有规定的除外。",
    supportingQuote: "征得该自然人或者其监护人同意，但是法律、行政法规另有规定的除外",
  },
};

export async function loadLegalPassages(): Promise<Array<{ sourceId: string; title: string; body: string }>> {
  const passages = [];
  for (const item of FILES) {
    const body = (await Bun.file(new URL(`./sources/${item.file}`, import.meta.url)).text()).replace(/\r\n/g, "\n").trim();
    passages.push({ sourceId: item.sourceId, title: item.title, body });
  }
  return passages;
}

export function legalClaims(): DraftClaim[] {
  return [
    {
      id: "l-privacy",
      text: "自然人享有隐私权。",
      sourceId: "cc-1032",
      quote: "自然人享有隐私权",
    },
    {
      id: "l-secret",
      text: "处理他人的私密信息，只要法律没有另行规定，就不需要权利人同意。",
      sourceId: "cc-1033",
      quote: "除法律另有规定或者权利人明确同意外",
    },
    {
      id: "l-consent",
      text: "处理个人信息，应当征得该自然人或者其监护人同意，但是法律、行政法规另有规定的除外。",
      sourceId: "cc-1035",
      quote: "征得该自然人或者其监护人同意，但是法律、行政法规另有规定的除外",
    },
  ];
}

export async function legalSourceMap(): Promise<Map<string, SourceRecord>> {
  const passages = await loadLegalPassages();
  return new Map(
    passages.map((passage) => [
      passage.sourceId,
      {
        sourceId: passage.sourceId,
        body: passage.body,
        active: true,
        contentHash: contentHashOf(passage.body),
      },
    ]),
  );
}

export function legalPrices(): Map<string, string> {
  return new Map(FILES.map((item) => [item.sourceId, "1000"]));
}

export const legalJudge: Judge = async ({ claim }) => {
  const found = JUDGEMENTS[claim.id];
  if (!found) throw new Error(`没有法律样例判定：${claim.id}`);
  return found;
};
