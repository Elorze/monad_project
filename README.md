# CiteAudit

Agent 已经写好的答案，对着资料核对。支持的说法才结算，说反了的不付。Monad 测试网上的演示用 MockUSDC。

教学用的《演示条例》是虚构法条，不是法律意见，也不能拿去适用。CiteAudit 不是法律产品，不接 Westlaw、Lexis 或任何真实法律库。北岚科技的研报同样是虚构的。

## 演示顺序

1. 斯坦福 RegLab / HAI：专门的法律 AI 仍会幻觉。Lexis+ AI 和 Ask Practical Law AI 超过 17% 的查询给出误导信息，Westlaw AI-Assisted Research 超过 34%。https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries
2. 法律意见样例：监护人那句引文是原文子串，语义却说反了，所以不付钱。
3. 页面下方的评测表：只看子串的误付率，对照数字与方向规则。21 条在链下计算，模型整集没跑完的那一列不填。

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
