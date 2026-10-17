const PERCENT = /(\d+(?:\.\d+)?)%/gu;
const DECIMAL = /\d+\.\d+/gu;

export function surfaceConflict(claim: string, quote: string): "CONTRADICTED" | undefined {
  const claimPercents = [...claim.matchAll(PERCENT)].map((match) => match[1] ?? "");
  const quotePercents = new Set([...quote.matchAll(PERCENT)].map((match) => match[1] ?? ""));
  if (claimPercents.some((value) => value.length > 0 && !quotePercents.has(value))) return "CONTRADICTED";

  const claimDecimals = [...claim.matchAll(DECIMAL)].map((match) => match[0]);
  const quoteDecimals = new Set([...quote.matchAll(DECIMAL)].map((match) => match[0]));
  if (claimDecimals.some((value) => !quoteDecimals.has(value))) return "CONTRADICTED";

  if (claim.includes("成本下降") && quote.includes("成本上升")) return "CONTRADICTED";
  if (claim.includes("成本上升") && quote.includes("成本下降") && !quote.includes("成本上升")) return "CONTRADICTED";

  const claimUp = hasAny(claim, ["上升", "回升", "上涨"]);
  const claimDown = hasAny(claim, ["下降", "下跌", "回落"]);
  const quoteUp = hasAny(quote, ["上升", "回升", "上涨"]);
  const quoteDown = hasAny(quote, ["下降", "下跌", "回落"]);
  if (claimUp && quoteDown && !quoteUp) return "CONTRADICTED";
  if (claimDown && quoteUp && !quoteDown) return "CONTRADICTED";

  if (quote.includes("不是需求塌方") && claim.includes("需求塌方") && !claim.includes("不是")) return "CONTRADICTED";
  return undefined;
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}
