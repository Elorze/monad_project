import { useEffect, useState } from "react";
import { emptyAnswer, explorerTx, reduceAnswer, takeSseEvents, usdc, verdictLabel, type AnswerState, type ClaimView } from "./reduce.ts";

type Passage = { sourceId: string; title: string; body: string; isOriginal: boolean };
type Sample = { id: "legal" | "report"; title: string; disclaimer: string; passages: Passage[]; opinion: string };
type EvalMethod = { name: string; mispayment: number; paid: number; wrong: number };
type EvalSummary = { caseCount: number; methods: EvalMethod[]; omitted: string };

export function App() {
  const [samples, setSamples] = useState<Record<string, Sample>>({});
  const [sampleId, setSampleId] = useState<"legal" | "report">("legal");
  const [budget, setBudget] = useState("5000");
  const [state, setState] = useState<AnswerState>(emptyAnswer());
  const [busy, setBusy] = useState(false);
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);

  useEffect(() => {
    void fetch("/samples")
      .then((response) => response.json())
      .then((rows: Record<string, Sample>) => setSamples(rows))
      .catch(() => setSamples({}));
    void fetch("/eval")
      .then((response) => response.json())
      .then((summary: EvalSummary) => setEvalSummary(summary))
      .catch(() => setEvalSummary(null));
  }, []);

  const sample = samples[sampleId];

  async function verify() {
    setBusy(true);
    setState(emptyAnswer());
    try {
      const response = await fetch("/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample: sampleId, budget }),
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
        for (const event of taken.events) setState((current) => reduceAnswer(current, event));
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
        <h1>Agent 写好的答案，对着资料核对，再决定付不付钱。</h1>
        <p className="lede">
          斯坦福 RegLab / HAI：Lexis+ AI 和 Ask Practical Law AI 有超过 17% 的查询给出误导信息，Westlaw AI-Assisted Research 超过 34%。
          <a href="https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries">来源</a>
        </p>
        <p className="note">演示用托管预算，结算币是 MockUSDC。产品不改名叫法律工具，也不接真实法律库。</p>
        <div className="toolbar">
          <button type="button" className={sampleId === "legal" ? "on" : ""} onClick={() => setSampleId("legal")}>
            法律意见
          </button>
          <button type="button" className={sampleId === "report" ? "on" : ""} onClick={() => setSampleId("report")}>
            研报
          </button>
          <label>
            预算
            <input value={budget} onChange={(event) => setBudget(event.target.value)} />
          </label>
          <button type="button" onClick={() => void verify()} disabled={busy}>
            {busy ? "核对中" : "核对这条意见"}
          </button>
        </div>
        <p className="script">
          台词：先说斯坦福的六分之一；再看法律样例里那句引文是原文、意思却说反了，只看子串会付钱，这里不付；最后亮下面的评测表。
        </p>
      </header>
      {sample?.disclaimer ? <p className="disclaimer">{sample.disclaimer}</p> : null}
      <section className="layout">
        <section>
          <h2>源文</h2>
          {(sample?.passages ?? []).map((passage) => (
            <article key={passage.sourceId} className="passage">
              <p className="meta">
                {passage.title} · {passage.isOriginal ? "原创" : "转载"}
              </p>
              <p>{passage.body}</p>
            </article>
          ))}
        </section>
        <section>
          <h2>Agent 意见</h2>
          {state.error ? <p className="error">{state.error}</p> : null}
          <p className="answer">{state.answer || sample?.opinion || "选择样例后点核对。"}</p>
        </section>
        <section>
          <h2>判定和结算</h2>
          <p>
            已付 {paid} 条 · {usdc(state.spent)} USDC
          </p>
          <p>已标记 {flagged} 条</p>
          <p>退回 {usdc(state.refund)} USDC</p>
          {state.claims.length === 0 ? <p className="placeholder">核对后，每条说法出现在这里。</p> : null}
          {state.claims.map((claim) => (
            <ClaimCard key={claim.claimId} claim={claim} />
          ))}
        </section>
      </section>
      <section className="eval">
        <h2>评测表</h2>
        <p className="note">21 条标注在链下跑。数字来自这次计算，没有预填。模型整集还没跑，所以没有第三列。</p>
        <table>
          <thead>
            <tr>
              <th>方法</th>
              <th>误付率</th>
              <th>付了的条数</th>
              <th>其中不该付</th>
            </tr>
          </thead>
          <tbody>
            {(evalSummary?.methods ?? []).map((method) => (
              <tr key={method.name}>
                <td>{method.name}</td>
                <td>{(method.mispayment * 100).toFixed(1)}%</td>
                <td>{method.paid}</td>
                <td>{method.wrong}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {evalSummary ? <p className="note">{evalSummary.omitted}</p> : null}
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
      <p className="meta">{claim.amount ? `${usdc(claim.amount)} USDC` : "不付款"}</p>
      {claim.txHash ? <a href={explorerTx(claim.txHash)}>查看测试网交易</a> : <span className="meta">这笔没有新的链上交易</span>}
    </article>
  );
}
