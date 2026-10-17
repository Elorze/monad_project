# CiteAudit

Agent 已经写好的答案，对着资料核对。支持的说法才结算，说反了的不付。Monad 测试网上的演示用 MockUSDC。

法律样例摘自《中华人民共和国民法典》公开文本第1032条至第1035条。中间那段意见是 glm-4-flash 根据这四条生成后存档的，不是手写错例，也不是法律意见。CiteAudit 不是法律产品，不接 Westlaw、Lexis 或任何真实法律库。北岚科技的研报是虚构的。

## 演示顺序

1. 斯坦福 RegLab / HAI：专门的法律 AI 仍会幻觉。Lexis+ AI 和 Ask Practical Law AI 超过 17% 的查询给出误导信息，Westlaw AI-Assisted Research 超过 34%。https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries
2. 法律意见样例：glm-4-flash 写的赔偿结论，引用的句子里没有赔偿金额，所以不付钱。另一条引文是它自己拼出来的，不是条文里的连续原句，也不付。
3. 页面下方的评测表：30 条链下标注。2026-10-17 用 glm-4-flash 实跑，没有预填。

| 方法 | 误付率 | 付了 | 其中不该付 |
| --- | --- | --- | --- |
| 仅子串 | 64.3% | 28 | 18 |
| 数字与方向规则 | 52.4% | 21 | 11 |
| 最小提示（glm-4-flash） | 16.7% | 12 | 2 |
| 优化核对（glm-4-flash） | 9.1% | 11 | 1 |

误付率是“付了的里面，标准答案不是支持”的比例。优化核对仍会付掉 `num-points`。最小提示还会多付 `num-growth`。模型失败记为未支持，这一轮没有失败。原始记录在 `eval/results.json`。

## 已部署

- 操作员：`0x270dA48Fe6B3Db7b4cf3454eb88F57efC73641E4`
- MockUSDC：`0x068af1afc9e6ab9492c396d7d953d1f5ae7689cf`
- CiteEscrow：`0xb82b287215a41d9cf3837373aba4db85d6b7b29d`
- 浏览器：https://testnet.monadexplorer.com

合约和结算逻辑这次没有改。研报样例里毛利率、云成本两条仍链到已经终局的交易。法律样例只做核对，不新发交易。

## 本地运行

```bash
cd server && bun test && bun src/index.ts
cd web && bun install && bun run dev
```

服务端端口 8787。打开页面后先看法律意见，再切研报。

私钥放在本地 `.env`，不要提交。
