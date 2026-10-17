export const PROMPT_VERSION = "ours-1";

export function oursPrompt(input: { claim: string; quote: string; context: string }): string {
  return [
    "你在核实一条引用是否支持 claim。只输出 JSON，不要输出其他文字。",
    "JSON 字段：verdict、rationale、supportingQuote。",
    "verdict 只能是 SUPPORTED、CONTRADICTED、UNSUPPORTED。",
    "SUPPORTED：上下文蕴含 claim 的每个事实要素，包括数字、方向、主体、时间。",
    "CONTRADICTED：上下文与任一要素冲突。",
    "UNSUPPORTED：既不蕴含也不冲突，包括话题相关但没说这件事。",
    "先把 claim 拆成原子事实，逐条对照，再汇总。任一冲突则 CONTRADICTED；任一缺失则 UNSUPPORTED。",
    "判 SUPPORTED 时必须给出 supportingQuote，且逐字来自上下文。没有 supportingQuote 就不得判 SUPPORTED。",
    "rationale 不超过 80 个字。",
    "数字、单位、方向、否定词、时间范围必须一致。",
    `claim：${input.claim}`,
    `引用：${input.quote}`,
    `上下文：${input.context}`,
  ].join("\n");
}

export function baselineBPrompt(input: { claim: string; quote: string; context: string }): string {
  return [
    "这条引用是否支持这个 claim？只输出 JSON。",
    "verdict 只能是 SUPPORTED、CONTRADICTED 或 UNSUPPORTED。",
    `claim：${input.claim}`,
    `引用：${input.quote}`,
    `上下文：${input.context}`,
  ].join("\n");
}
