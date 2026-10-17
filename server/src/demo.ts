import type { DraftClaim } from "./hardChecks.ts";
import type { Judge, Judgement } from "./verify.ts";

export const DEMO_QUESTION = "北岚科技2026年第二季度毛利率是多少？主要驱动是什么？";

const DEMO_JUDGEMENTS: Record<string, Judgement> = {
  "c-margin": {
    verdict: "SUPPORTED",
    rationale: "研报写明毛利率为32.4%，且给出了同比下降。",
    supportingQuote: "毛利率为32.4%，较上年同期的35.1%下降2.7个百分点",
  },
  "c-driver": {
    verdict: "SUPPORTED",
    rationale: "业绩说明把下降主要归因于云基础设施成本上升。",
    supportingQuote: "下降主要归因于云基础设施成本上升",
  },
  "c-subscription": {
    verdict: "SUPPORTED",
    rationale: "研报写明订阅收入同比增长18%，但不足以抵消成本端压力。",
    supportingQuote: "订阅收入同比增长18%，但不足以抵消成本端压力",
  },
};

export function isDemoQuestion(question: string): boolean {
  return question.includes("北岚科技") && question.includes("毛利率");
}

export function demoClaims(): DraftClaim[] {
  return [
    {
      id: "c-margin",
      text: "北岚科技2026年第二季度毛利率为32.4%。",
      sourceId: "report-beilan",
      quote: "毛利率为32.4%，较上年同期的35.1%下降2.7个百分点",
    },
    {
      id: "c-driver",
      text: "毛利率下降的主要原因是云基础设施成本上升。",
      sourceId: "report-beilan",
      quote: "下降主要归因于云基础设施成本上升",
    },
    {
      id: "c-subscription",
      text: "订阅收入同比增长18%，但不足以抵消成本端压力。",
      sourceId: "report-beilan",
      quote: "订阅收入同比增长18%，但不足以抵消成本端压力",
    },
  ];
}

export const demoJudge: Judge = async ({ claim }) => {
  const found = DEMO_JUDGEMENTS[claim.id];
  if (!found) throw new Error(`没有演示判定：${claim.id}`);
  return found;
};
