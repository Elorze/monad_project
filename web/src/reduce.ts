export type ClaimView = {
  claimId: string;
  text: string;
  quote: string;
  sourceId: string;
  verdict: "SUPPORTED" | "CONTRADICTED" | "UNSUPPORTED";
  action: "PAID" | "FLAGGED" | "SKIPPED";
  amount?: string;
  rationale: string;
  evidenceHash: string;
  txHash?: string;
};

export type AnswerState = {
  answer: string;
  claims: ClaimView[];
  spent: string;
  refund: string;
  refundTx?: string;
  error: string;
};

export const emptyAnswer = (): AnswerState => ({
  answer: "",
  claims: [],
  spent: "0",
  refund: "0",
  error: "",
});

export function reduceAnswer(state: AnswerState, event: { type?: string; [key: string]: unknown }): AnswerState {
  if (event.type === "answer") {
    return { ...emptyAnswer(), answer: String(event.answer ?? "") };
  }
  if (event.type === "claim") {
    return { ...state, claims: [...state.claims, event as ClaimView] };
  }
  if (event.type === "done") {
    return {
      ...state,
      spent: String(event.spent ?? "0"),
      refund: String(event.refund ?? "0"),
      refundTx: typeof event.refundTx === "string" ? event.refundTx : undefined,
    };
  }
  if (event.type === "error") return { ...state, error: String(event.message ?? "出错了") };
  return state;
}

export function takeSseEvents(buffer: string): { events: Array<{ type?: string }>; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: Array<{ type?: string }> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    events.push(JSON.parse(trimmed.slice(5).trim()) as { type?: string });
  }
  return { events, rest };
}

export function explorerTx(hash: string): string {
  return `https://testnet.monadexplorer.com/tx/${hash}`;
}

export function verdictLabel(verdict: string): string {
  if (verdict === "SUPPORTED") return "支持，付款";
  if (verdict === "CONTRADICTED") return "矛盾，拒付";
  return "未支持";
}

export function usdc(amount: string | undefined): string {
  if (!amount) return "0";
  const whole = BigInt(amount);
  const units = whole / 1_000_000n;
  const frac = (whole % 1_000_000n).toString().padStart(6, "0").replace(/0+$/u, "");
  return frac.length === 0 ? `${units}` : `${units}.${frac}`;
}
