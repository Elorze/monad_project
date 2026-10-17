# CiteAudit

Agent 已经写好的答案，对着资料核对。支持的说法才结算，说反了或不在原文里的不付。Monad 测试网上的演示用 MockUSDC。

法律样例摘自《中华人民共和国民法典》公开文本第 1032–1035 条。存档意见来自 glm-4-flash，不是手写错例，也不是法律意见。CiteAudit 不是法律产品，不接 Westlaw / Lexis。北岚科技研报是虚构的。

## 三分钟怎么讲

1. 斯坦福 RegLab / HAI：Lexis+ / Ask Practical Law AI 超过 17% 误导，Westlaw AI-Assisted Research 超过 34%。https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries
2. 在 Cursor 里贴 `demo/prompt.md`，让 Agent **必须先调用** MCP 工具 `verify_and_settle`。
3. 切到网页：同一份判定实时出现（页面每 2 秒读 `/last-verify`）。矛盾 / 未支持不付钱。
4. 滚到评测表：仅子串误付 64.3% → 优化核对 9.1%。
5. 收尾：Agent 写好的答案，对着资料核对，再决定付不付钱。

讲稿全文见 `demo/script.md`。备用截图在 `demo/scene-*.jpg`。若要快速录屏，打开 `demo/backup.html`（会自动轮播三张场景），用系统自带录屏即可。

## 评测怎么出

```bash
cd server
bun --env-file=../.env src/evalLive.ts
```

写到 `eval/results.json`，`/eval` 和 README 表读这份文件，不预填。30 条标注在 `eval/cases.json`。

| 方法 | 误付率 | 付了 | 其中不该付 |
| --- | --- | --- | --- |
| 仅子串 | 64.3% | 28 | 18 |
| 数字与方向规则 | 52.4% | 21 | 11 |
| 最小提示（glm-4-flash） | 16.7% | 12 | 2 |
| 优化核对（glm-4-flash） | 9.1% | 11 | 1 |

误付率 = 付了的里面，标准答案不是 SUPPORTED 的比例。

## 跟竞品差在哪

| | 仅子串 / CitePay 类 | CiteAudit |
| --- | --- | --- |
| 判定 | 引文在不在原文 | SUPPORTED / CONTRADICTED / UNSUPPORTED |
| 付款 | 有引文就付 | 只有 SUPPORTED 付；说反的拒付 |
| 证据 | 可选 | 每条 claim 证据哈希；演示里研报两条已上链 |
| 量化 | 常没有 | 30 条标注，四种方法对照 |

## 为什么是 Monad

测试网约 600ms 终局、费用极低，适合「答案还在流、付款已落地」的逐 claim 结算。本仓库用 MockUSDC + `CiteEscrow`，不改合约。

## 已部署

- 操作员：`0x270dA48Fe6B3Db7b4cf3454eb88F57efC73641E4`
- MockUSDC：`0x068af1afc9e6ab9492c396d7d953d1f5ae7689cf`
- CiteEscrow：`0xb82b287215a41d9cf3837373aba4db85d6b7b29d`
- 浏览器：https://testnet.monadexplorer.com

研报样例里毛利率、云成本两条链到已终局交易。法律 / MCP 样例只做核对，不新发交易；SUPPORTED 若 claim id 对得上录制回执才会带 `txHash`。

## 本地运行

```bash
# 终端 1
cd server && bun test && bun src/index.ts

# 终端 2
cd web && bun install && bun run dev
```

服务端 `8787`，页面 `5173`。先确保 `/health` 为 ok。

### 接上 MCP（Cursor）

1. 服务端保持运行。
2. 项目已有 `.cursor/mcp.json`。若本机 bun 路径不同，改 `command` 为你的 `bun.exe`，`args` 指向本仓库的 `mcp/server.ts`。
3. Cursor → Settings → MCP → 启用 `citeaudit`。
4. 新开 Agent 对话，整段粘贴 `demo/prompt.md`。不要手动点网页「核对」来冒充调用。
5. 工具会 POST `http://127.0.0.1:8787/verify`，结果写入 `eval/last-verify.json`，网页自动刷新同一结果。

手动测工具：

```bash
cd mcp && bun server.ts
# 或 curl
curl -s http://127.0.0.1:8787/verify -H "content-type: application/json" --data-binary @../fixtures/verify-example.json
```

民法典原文：`fixtures/civil-code.json`。

私钥只放本地 `.env`，不要提交。
