import { useEffect, useState } from "react";
import { emptyAnswer, explorerTx, reduceAnswer, takeSseEvents, usdc, verdictLabel, type AnswerState, type ClaimView } from "./reduce.ts";

type Passage = { sourceId: string; title: string; body: string; isOriginal: boolean };
type Sample = { id: "legal" | "report"; title: string; disclaimer: string; passages: Passage[]; opinion: string };
type LastVerify = {
  answerId: string;
  answer: string;
  sources: Array<{ sourceId: string; title: string; body: string }>;
  spent: string;
  refund: string;
  refundTx?: string;
  claims: ClaimView[];
  savedAt: string;
  via: "mcp";
};

const REPORT_TXS = [
  {
    label: "研报 · 毛利率已终局",
    hash: "0x7158f1b908f5387d2ceae25314255a46a5f1c86e4c02f18bab0650c5ab341270",
  },
  {
    label: "研报 · 云成本已终局",
    hash: "0x6ad4b49228c917e03fc93ee559bb543a4692b300a99ad91aa61f4e88a734ae2e",
  },
];

const WAITING = "等待 Agent 调用 verify_and_settle…";

export function App() {
  const [samples, setSamples] = useState<Record<string, Sample>>({});
  const [sampleId, setSampleId] = useState<"legal" | "report">("legal");
  const [budget, setBudget] = useState("5000");
  const [state, setState] = useState<AnswerState>(emptyAnswer());
  const [busy, setBusy] = useState(false);
  const [mcpPassages, setMcpPassages] = useState<Passage[] | null>(null);
  const [mcpNote, setMcpNote] = useState("等待 verify_and_settle");
  const [showSample, setShowSample] = useState(false);

  useEffect(() => {
    void fetch("/samples")
      .then((response) => response.json())
      .then((rows: Record<string, Sample>) => setSamples(rows))
      .catch(() => setSamples({}));
  }, []);

  useEffect(() => {
    let seen = "";
    let ready = false;
    void fetch("/last-verify")
      .then(async (response) => {
        if (response.ok) {
          const body = (await response.json()) as LastVerify;
          seen = body.answerId ?? "";
        }
      })
      .finally(() => {
        ready = true;
      });
    const timer = window.setInterval(() => {
      if (!ready) return;
      void fetch("/last-verify")
        .then(async (response) => {
          if (!response.ok) return;
          const body = (await response.json()) as LastVerify;
          if (!body.answerId || body.answerId === seen) return;
          seen = body.answerId;
          setShowSample(false);
          setMcpPassages(body.sources.map((source) => ({ ...source, isOriginal: true })));
          setMcpNote(`MCP verify_and_settle 刚写入 · ${body.savedAt}`);
          setState({
            answer: body.answer,
            claims: body.claims,
            spent: body.spent,
            refund: body.refund,
            refundTx: body.refundTx,
            error: "",
          });
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const sample = samples[sampleId];
  const passages = mcpPassages ?? (showSample ? (sample?.passages ?? []) : []);

  async function verify() {
    setBusy(true);
    setShowSample(true);
    setMcpPassages(null);
    setMcpNote("备用自检，不是 Agent 调用");
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
  const refused = state.claims.filter((claim) => claim.action !== "PAID").length;

  return (
    <main className="page">
      <header className="top">
        <p className="mark">CiteAudit</p>
        <h1>按核实付钱：支持才付，说反了或原文没有的不付。</h1>
        <p className="lede">
          斯坦福 RegLab / HAI：Lexis+ AI 和 Ask Practical Law AI 超过 17% 的查询给出误导信息，Westlaw AI-Assisted Research 超过 34%。
          <a href="https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries">来源</a>
        </p>
        <p className="status">{mcpNote}</p>
        <p className="fineprint">演示用托管预算，结算币是 MockUSDC。不是法律意见，也不接真实法律库。</p>
        <details className="backup">
          <summary>备用：本页自检</summary>
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
              {busy ? "核对中" : "核对本页样例"}
            </button>
          </div>
          {showSample && sample?.disclaimer ? <p className="fineprint">{sample.disclaimer}</p> : null}
        </details>
      </header>
      <section className="layout">
        <section>
          <h2>源文</h2>
          {passages.length === 0 ? <p className="placeholder">{WAITING}</p> : null}
          {passages.map((passage) => (
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
          <p className="answer">{state.answer || WAITING}</p>
        </section>
        <section>
          <h2>判定和结算</h2>
          <p>已付 {paid} 条 · {usdc(state.spent)} USDC</p>
          <p>拒付 {refused} 条</p>
          <p>退回 {usdc(state.refund)} USDC</p>
          {state.claims.length === 0 ? <p className="placeholder">{WAITING}</p> : null}
          {state.claims.map((claim) => (
            <ClaimCard key={claim.claimId} claim={claim} />
          ))}
          <p className="receipts">
            链上结算看研报样例：
            {REPORT_TXS.map((tx) => (
              <a key={tx.hash} href={explorerTx(tx.hash)}>
                {tx.label}
              </a>
            ))}
          </p>
        </section>
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
      {claim.action === "PAID" && claim.txHash ? (
        <a href={explorerTx(claim.txHash)}>查看这笔测试网交易</a>
      ) : (
        <span className="meta">本条仅完成核对闸门</span>
      )}
    </article>
  );
}
