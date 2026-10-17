import type { VerifyResult } from "./verify.ts";

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
