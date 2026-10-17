import { contentHashOf, type DraftClaim, type SourceRecord } from "./hardChecks.ts";
import type { Judge, Judgement } from "./verify.ts";

export const LEGAL_DISCLAIMER = "以下法条为教学虚构，不是法律意见，也不能拿去适用。CiteAudit 不是法律产品。";

const ARTICLE_12 =
  "跨境传输个人数据，应当取得本人的单独同意。但是，为履行与个人签订的合同所必需的，不需要单独同意。";
const ARTICLE_13 = "单独同意必须由本人作出。监护人代为同意不视为本人的单独同意。";

export const legalPassages = [
  { sourceId: "statute-12", title: "《演示条例》第12条", body: ARTICLE_12 },
  { sourceId: "statute-13", title: "《演示条例》第13条", body: ARTICLE_13 },
];

export const LEGAL_OPINION =
  "为履行与个人签订的合同所必需时，跨境传输个人数据不需要单独同意。另外，监护人代为同意视为本人的单独同意。";

const JUDGEMENTS: Record<string, Judgement> = {
  "l-contract": {
    verdict: "SUPPORTED",
    rationale: "第12条但书写明，为履行与个人签订的合同所必需的，不需要单独同意。",
    supportingQuote: "为履行与个人签订的合同所必需的，不需要单独同意",
  },
  "l-guardian": {
    verdict: "CONTRADICTED",
    rationale: "引文是第13条原句，但原句写的是不视为本人的单独同意，意见把“不”去掉了。",
    supportingQuote: "监护人代为同意不视为本人的单独同意",
  },
};

export function legalClaims(): DraftClaim[] {
  return [
    {
      id: "l-contract",
      text: "为履行与个人签订的合同所必需时，跨境传输个人数据不需要单独同意。",
      sourceId: "statute-12",
      quote: "为履行与个人签订的合同所必需的，不需要单独同意",
    },
    {
      id: "l-guardian",
      text: "监护人代为同意视为本人的单独同意。",
      sourceId: "statute-13",
      quote: "监护人代为同意不视为本人的单独同意",
    },
  ];
}

export function legalSourceMap(): Map<string, SourceRecord> {
  return new Map(
    legalPassages.map((passage) => [
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
  return new Map(legalPassages.map((passage) => [passage.sourceId, "1000"]));
}

export const legalJudge: Judge = async ({ claim }) => {
  const found = JUDGEMENTS[claim.id];
  if (!found) throw new Error(`没有法律样例判定：${claim.id}`);
  return found;
};
