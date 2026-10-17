import { useEffect, useState } from "react";
import { emptyAnswer, explorerTx, reduceAnswer, takeSseEvents, usdc, verdictLabel, type AnswerState, type ClaimView } from "./reduce.ts";

type SourceRow = {
  sourceId: string;
  title: string;
  publisher: string;
  isOriginal: boolean;
  pricePerClaim: string;
};

const DEMO_QUESTION = "北岚科技2026年第二季度毛利率是多少？主要驱动是什么？";

export function App() {
  const [question, setQuestion] = useState(DEMO_QUESTION);
  const [budget, setBudget] = useState("5000");
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [state, setState] = useState<AnswerState>(emptyAnswer());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/sources")
      .then((response) => response.json())
      .then((rows: SourceRow[]) => setSources(rows))
      .catch(() => setSources([]));
  }, []);

  async function ask() {
    setBusy(true);
    setState(emptyAnswer());
    try {
      const response = await fetch("/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, budget }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({ message: "请求失败" }))) as { message?: string };
        setState({ ...emptyAnswer(), error: body.message ?? "请求失败" });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const taken = takeSseEvents(buffer);
        buffer = taken.rest;
        for (const event of taken.events) {
          setState((current) => reduceAnswer(current, event));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const paid = state.claims.filter((claim) => claim.action === "PAID").length;
  const flagged = state.claims.filter((claim) => claim.action === "FLAGGED").length;

  return (
    <main className="page">
      <header className="top">
        <p className="mark">CiteAudit</p>
        <h1>每一笔付款背后都有一条核实过的证据。</h1>
        <p className="note">演示用托管预算。结算币是 MockUSDC，不是 Circle 测试网 USDC。</p>
      </header>
      <section className="layout">
        <aside>
          <label>
            问题
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={5} />
          </label>
          <label>
            预算（USDC 最小单位，1000 = 0.001）
            <input value={budget} onChange={(event) => setBudget(event.target.value)} />
          </label>
          <button type="button" onClick={() => void ask()} disabled={busy}>
            {busy ? "核实中" : "提问"}
          </button>
          <ul className="sources">
            {sources.map((source) => (
              <li key={source.sourceId}>
                <strong>{source.title}</strong>
                <span>{source.isOriginal ? "原创" : "转载"}</span>
                <span>
                  {source.publisher} · {usdc(source.pricePerClaim)} USDC/条
                </span>
              </li>
            ))}
          </ul>
        </aside>
        <section className="claims">
          {state.error ? <p className="error">{state.error}</p> : null}
          {state.answer ? <p className="answer">{state.answer}</p> : <p className="placeholder">先问北岚科技的毛利率。</p>}
          {state.claims.map((claim) => (
            <ClaimCard key={claim.claimId} claim={claim} />
          ))}
        </section>
        <aside className="summary">
          <h2>这一次</h2>
          <p>已付 {paid} 条 · {usdc(state.spent)} USDC</p>
          <p>已标记 {flagged} 条</p>
          <p>退回 {usdc(state.refund)} USDC</p>
          {state.refundTx ? (
            <a href={explorerTx(state.refundTx)}>退款交易</a>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function ClaimCard({ claim }: { claim: ClaimView }) {
  return (
    <article className={`card ${claim.action.toLowerCase()}`}>
      <p className="badge">{verdictLabel(claim.verdict)}</p>
      <h3>{claim.text}</h3>
      <blockquote>{claim.quote}</blockquote>
      <p>{claim.rationale}</p>
      <p className="meta">
        {claim.sourceId}
        {claim.amount ? ` · ${usdc(claim.amount)} USDC` : ""}
      </p>
      {claim.txHash ? <a href={explorerTx(claim.txHash)}>查看测试网交易</a> : <span className="meta">这笔没有上链</span>}
    </article>
  );
}
