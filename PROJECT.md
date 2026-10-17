# CiteAudit 引证审计结算 — 项目设计文档（Monad Blitz，单人 6h）

> **一句话：每一笔付款背后都有一条核实过的证据。**
> AI 回答里的每一条 claim 先被语义核实（SUPPORTED / CONTRADICTED / UNSUPPORTED，引文逐字硬校验），**只有 SUPPORTED 的来源被实时付款**；CONTRADICTED 的来源不付款并被标记；每一笔付款在 Monad 上留下一张可复核的审计回执。

- 读者：Cursor（照此写代码）、队友、Gemini（讨论/挑刺）
- 文档日期：2026-10-17（北京时间）；编码窗口 12:00–18:30
- 规则：**今天从零写代码**、AI 辅助可以、仓库开源（GitHub）；Demo 3 分钟（上限 5 分钟）
- 标注约定：**【已验证】** 有来源/实测；**【假设】** 待访谈验证；**【未核实】** 没查到可靠来源

---

## 0. TL;DR

| 项 | 内容 |
|---|---|
| 问题 | AI 搜索/Agent 的引用经常是错的（Tow Center：8 个 AI 搜索工具 1600 次查询，>60% 答错；DeepSeek 200 次里 115 次归错来源）。而现有分成（Perplexity、ProRata、Cloudflare Pay Per Use）都按“被引用/被抓取”结算，**没有人核实引用是否真的支持那句话**。 |
| 方案 | claim 级语义核实 + 引文子串硬校验 → 按 verdict 实时结算（逐 claim、USDC、Monad 600ms 终局）→ 链上审计回执（证据哈希） |
| 与 Obolus/Keryx/CitePay 的差异 | ① 不止子串：三分类语义核实，**CONTRADICTED 会被抓出来并拒付**；② 用 ~20 条 Tow Center 风格标注集**量化**“仅子串校验” vs “claim 级核实”的误付率；③ 逐 claim 流式结算 + 每笔付款绑定证据哈希 |
| Why Monad | 600ms 完全终局 + 每笔 ~$0.0002 级费用，让“回答还在流式输出、付款已不可回滚”成立；官方 x402 facilitator + 测试网 USDC。**弱点**：按“每回答一结”任何便宜链都能做（见 §6） |
| 6h 交付 | Web 页面：提问 → 流式答案 → 每条 claim 实时出 verdict 卡片 → 付款 tx/回执链接逐条出现；Eval 页：baseline（仅子串）vs ours 的指标表 |

---

## 1. 背景与痛点（附来源）

1. **AI 引用错误率高【已验证】**
   Tow Center（2025-03）：8 个生成式搜索工具，20 家出版商 × 10 篇 × 8 工具 = 1600 次查询，整体 >60% 答错；Perplexity 37%、ChatGPT Search 67%、Grok 3 94%；DeepSeek 200 次中 115 次归错来源；常引用转载版/编造链接；**“签了授权协议也不保证正确引用”**。
   - https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php
   - 方法与数据：https://github.com/TowCenter/genSearch-Part2
2. **分成已经在发生，但都按“出现次数/自报用量”结算【已验证】**
   - Perplexity Comet Plus：订阅收入 80% 分给出版商，按“人类访问 / 搜索引用 / agent 动作”分配，首期池 $42.5M。https://digiday.com/media/how-perplexity-new-revenue-model-works-according-to-its-head-of-publisher-partnerships/
   - ProRata/Gist：50% 收入按“各出版商内容在答案中的占比”分；约 100 份协议、500+ 刊物（官网称 1000+）。https://www.newsmediaalliance.org/prorata-licensing-partnership/ ，https://pressgazette.co.uk/publishers/digital-journalism/prorata-publishers-ai-start-up-news-widget-answers/
   - Cloudflare：Pay Per Crawl（2025-07，按抓取）→ Pay Per Use（2026-09-30，**AI 公司自定价、用量自报**）。https://nohacks.co/blog/websites-get-paid-for-ai-use-who-sets-the-price
   - TollBit：自称 7000+ 出版商，每月几百到几万美元，按抓取 CPM 计价。https://www.business-standard.com/companies/people/tollbit-is-about-monetising-ai-bot-traffic-says-cofounder-and-ceo-126030201054_1.html
   - Microsoft Publisher Content Marketplace（2026-02 试点），“按交付价值付费”，衡量方式未公开。https://serp.fast/blog/publisher-payment-rails-compared-2026
   - RSL：授权条款标准，要求 AI 方“必须提交用量报告”（自报）。同上
3. **缺口**：出版商拿到的是“平台说你被引用了 N 次”。**引用是否正确、是否支持该论断、是否被歪曲**，目前无人独立核实——这正是我们的切口。

---

## 2. 角色与场景（重点）

### 2.1 角色总览

| 角色 | 目标 | 痛点 | 在系统里做什么 | 得到什么 | 钱怎么流 | 验证状态 |
|---|---|---|---|---|---|---|
| **A. 来源方**：出版商、付费数据 API（财报/研报/法律数据库）、独立作者 | 内容被 AI 使用时拿到钱；不被歪曲 | 只能拿平台自报数据；被错误引用或被歪曲时毫无证据；转载站抢走归因 | 注册来源（`sourceId`、收款地址、内容哈希/URL）；可选设定每条 SUPPORTED claim 的单价 | 每次被**正确**使用即时到账 USDC；每笔有证据回执；被歪曲（CONTRADICTED）时拿到可公开的证据记录 | 收款方 ← 付款方托管 | 痛点【已验证：Tow Center + 出版商分成谈判报道】；愿意接入并为审计付费【假设】 |
| **B. AI 应用 / Agent 开发者**（付款方） | 合规使用付费内容；答案可信；只为真正用到的内容付钱 | 打包授权贵、按抓取付费为没用上的内容也付钱；幻觉引用带来法律/声誉风险 | 为每次回答设预算并存入托管；调用 `/answer` 或 `/audit` | 只为 SUPPORTED claim 付钱；可展示“已核实引用”徽章；审计日志 | 付款方 → 托管 → 来源方；付款方 → 平台（服务费） | 【假设】——最大不确定性：开发者为何不直接不付钱？（见 §2.4） |
| **C. 终端用户** | 得到可信答案 | 看不出哪条引用是真的 | 提问、点开 claim 卡片看证据 | 每条 claim 有 verdict + 原文引文 + 付款回执 | 不直接付钱（或通过订阅间接付） | 需求【已验证：Tow Center 指出用户被误导】；愿意为此付费【假设】 |
| **D. 审计方 / 出版商联盟**（如 News/Media Alliance 类组织） | 代表成员核对平台自报的引用与分成 | 无独立核查工具；平台报表不透明 | 上传平台导出的“答案 + 引用清单”，批量运行 `/audit` | 报表：正确引用率、被歪曲清单、应得 vs 实得差异，可作谈判/诉讼证据 | 联盟 → 平台（审计订阅/按次） | 【假设】，但最可能付钱的一方（Web2 意义上） |
| **E. 平台运营者（我们）** | 成为“引用核实 + 结算”的中立层 | 冷启动：两边都要接 | 运行核实流水线、托管合约、回执、评测集 | 每次结算抽成（如 5%）或 x402 按次审计费 | 收服务费 | 商业模式【假设】 |

### 2.2 端到端场景

#### 场景 1：研究 Agent 购买付费研报（主 Demo）
1. 付款方（研究 Agent，角色 B）为这次回答存入预算：`deposit(answerId, 0.05 USDC)` → `CiteEscrow`。
2. 用户问：“X 公司 2026 Q2 毛利率是多少？主要驱动？”
3. 平台从已注册的 3 个来源（研报 A、新闻 B、转载站 C）检索段落，生成答案；**LLM 输出结构化 claims**，每条带 `sourceId` + 逐字 quote。
4. 每条 claim 进入核实流水线：硬校验（quote 是否为该来源原文子串、来源是否注册）→ 语义判定（SUPPORTED/CONTRADICTED/UNSUPPORTED）。
5. 判定为 SUPPORTED 的瞬间，后端调用 `settleClaim(answerId, claimId, sourceId, amount, verdict, evidenceHash)`：托管 → 来源方地址转 USDC，并发出 `ClaimSettled` 事件。约 600ms 后终局，UI 显示 tx 链接。
6. claim 2 引用了新闻 B，但 B 原文写“毛利率下降”，答案说“上升” → **CONTRADICTED**：不付款，发出 `ClaimFlagged`，UI 标红。
7. 回答结束：`closeAnswer(answerId)` 退回未用预算给付款方。
- **钱流**：B 存 0.05 → 研报 A 收 2×0.01（2 条 SUPPORTED）→ 平台抽成 5% → 剩余退回 B。新闻 B 收 0。

#### 场景 2：出版商审计平台自报引用（Perplexity 类）
1. 出版商联盟（D）拿到某 AI 平台月报：“你的内容被引用 1,240 次”。抽样导出答案 + 引用（或用 Tow Center 方法自建查询集）。
2. 批量调用 `/audit`（不结算，只出报告）：每条 claim 判定 + 证据。
3. 输出：正确引用率、CONTRADICTED（被歪曲）清单、引用到转载站而非原站的比例、“平台自报 vs 核实后”的差距。
4. 可选：把报告哈希写上链（`AuditAnchored`），作为谈判/争议时的时间戳证据。
- **钱流**：D → 平台（按次 x402 或订阅）。不涉及给来源方付款。
- 黑客松里只做：`/audit` 接口 + 报告页（复用同一流水线）。

#### 场景 3：基于付费法律/金融数据的 RAG
1. 律所内部 RAG 使用付费判例/法规数据库（来源方 A），按 SUPPORTED claim 单价付费。
2. 律师得到的答案中，UNSUPPORTED claim（引用存在但不能支撑结论）会被高亮——这既是风控，也意味着数据库方不因“被挂名但没用上”而收费。
3. 数据库方获得：真实使用计量（哪些条款被哪些结论使用），可用于定价。
- **钱流**：律所 → 托管 → 数据库方（仅 SUPPORTED）；律所 → 平台服务费。
- 【假设】律所是否接受把查询元数据（哈希）上链——只上链哈希，不上原文。

#### 场景 4：CONTRADICTED 争议
1. 来源方 A 在回执里看到自己有一条 `ClaimFlagged`（CONTRADICTED，未付款），认为判错。
2. A 打开回执：证据 JSON（claim 文本、quote、原文上下文、判定理由、模型/提示词版本）可按 `evidenceHash` 复核（链下存储，链上只存哈希）。
3. A 发起争议（黑客松版本：UI 上一个“申诉”按钮 + `Disputed` 事件，人工复核）。
4. 复核为误判 → 运营者调用 `settleClaim` 补付，并在评测集中加入此案例（失败案例迭代闭环）。
- **钱流**：补付由付款方托管余额或平台垫付（产品策略待定【假设】）。
- 黑客松只做到第 2 步 + 申诉事件，不做仲裁。

### 2.3 谁付谁（汇总）

```
付款方(AI 应用/Agent) ──deposit──▶ CiteEscrow ──settleClaim(SUPPORTED)──▶ 来源方
                                     │             └─fee──▶ 平台
                                     └──closeAnswer──▶ 退回未用余额
审计方(联盟/出版商) ──x402 按次 / 订阅──▶ 平台（/audit 报告，可选链上锚定）
```

### 2.4 坦白：哪些已验证，哪些是假设

- **已验证**：引用错误普遍（Tow Center）；出版商正在拿到按引用/使用的分成，且计量依赖平台自报（Perplexity、Cloudflare Pay Per Use、RSL）；加密侧已有多个“按引用付款”项目（说明有人在做，也说明拥挤）。
- **假设（最关键）**：
  1. **付款方动机**：AI 开发者为什么自愿多一层核实再付钱？可能动机：付费 API 强制（不付读不到）、合规/法律、可展示的信任徽章。今天无证据证明他们愿意付。
  2. **审计方愿意为独立审计付费**：最可能的 Web2 买家，但未访谈。
  3. 来源方接受“被模型判 CONTRADICTED 就不付”——需要争议机制和公开的判定标准。
- 赛后验证计划见 §15。

---

## 3. 竞品对比

| 方案 | 结算依据 | 语义核实 claim | 抓 CONTRADICTED | 评测量化 | 链上回执 | 结算粒度 |
|---|---|---|---|---|---|---|
| Perplexity Comet Plus | 访问/引用/agent 动作计数 | 否 | 否 | 否 | 否 | 月度池 |
| ProRata/Gist | 内容占比（自研归因） | 未公开 | 未公开 | 未公开 | 否 | 收入分成 |
| Cloudflare Pay Per Use | AI 公司自报使用 | 否 | 否 | 否 | 否 | 按使用 |
| TollBit | 抓取次数（CPM） | 否 | 否 | 否 | 否 | 按抓取 |
| **Obolus** https://github.com/winsznx/obolus | 引文逐字子串 + 代码算权重 | **部分**（子串门） | 未见 | 未见 | Gateway 回执 | 每回答 |
| Keryx https://github.com/tang-vu/keryx | 引用 + 贡献权重 | 否（权重） | 否 | 否 | 链上注册表 | 每回答（x402 批量） |
| CitePay https://github.com/cyberrockng/citepay-markets | 语义相关度 + 规则 PAY/REFUSE | 相关度≠支持 | 否 | 否 | 链上回执 | 每源 |
| NanoProof https://github.com/networkbike/nanoproof-protocol | 引用检测（规则+分类器） | 否 | 否 | 否 | 哈希链 | 每引用 |
| **CiteAudit（我们）** | **SUPPORTED verdict** | **是（三分类）** | **是，拒付+标记** | **是（~20 条标注集）** | 每笔绑定 evidenceHash | **逐 claim、流式** |

注：Obolus/Keryx 等多出自 Circle × Canteen 在 Arc 上的 Lepton Agents Hackathon（2026-06）；是否获奖【未核实】。Monad Blitz 上未搜到同类【未核实】。

---

## 4. 范围（6h 单人）

### 必做（MVP）
1. 3–5 个**本地注册来源**（Markdown 文本，内置在 repo，模拟研报/新闻/转载站）；内容哈希上链注册。
2. `/answer`：检索 → LLM 生成带 claims 的结构化答案（`generateObject` + Zod）。
3. 核实流水线：硬校验 + 语义判定（一个 LLM 判定调用/claim，结构化输出）。
4. 合约 `CiteEscrow`：deposit / settleClaim / flagClaim / closeAnswer + 事件。
5. 逐 claim 结算：SSE 推送 verdict → 后端立刻发 tx → 推送 tx hash/终局。
6. Eval：~20 条标注用例，跑 baseline（仅子串）vs ours，输出指标 JSON + 表格页。
7. 前端单页：提问、claim 卡片流、回执链接、Eval 表。

### 可选（有时间才做）
- `/audit` 批量审计报告页（场景 2）
- x402 收审计费（官方 facilitator）
- 申诉按钮 + `Disputed` 事件（场景 4）
- MCP server 暴露 `audit_answer` 工具

### 明确不做
- 真实出版商接入、爬虫、版权法律判断
- 链上仲裁/质押/罚没
- 训练/微调模型
- 主网部署
- 隐私（Monad 的 Cadence/密文能力今天不可用）

---

## 5. 架构

```mermaid
flowchart LR
  U[终端用户 / 付款方 Agent] -->|问题 + 预算| FE[React/Vite 前端]
  FE -->|POST /answer (SSE)| API[Hono API · Bun]
  API --> R[检索: 本地来源库<br/>BM25/关键词即可]
  R --> G[生成: Vercel AI SDK generateObject<br/>Answer{claims[]}]
  G --> HC[硬校验<br/>quote 子串/sourceId/长度]
  HC --> V[语义判定<br/>SUPPORTED/CONTRADICTED/UNSUPPORTED]
  V --> EV[(证据 JSON<br/>evidenceHash=keccak256)]
  V -->|SUPPORTED| S[结算器 viem walletClient]
  V -->|CONTRADICTED| F[flagClaim]
  S --> C[(CiteEscrow 合约<br/>Monad Testnet 10143)]
  F --> C
  C -->|事件 ClaimSettled/Flagged| FE
  API -->|SSE: claim verdict + txHash + finalized| FE
  E[eval/ 标注集 20 条] --> API
```

要点：**LLM 永远不决定付款金额**；金额 = 来源单价（链上注册）× verdict 规则；verdict 必须先通过硬校验。

---

## 6. Why Monad（以及坦白的弱点）

| 论点 | 依据 | 评委可能反驳 | 我们的回答 |
|---|---|---|---|
| 600ms 完全终局：付款在答案流式输出期间就不可回滚 | docs.monad.xyz：300ms 出块、600ms finality【已验证】 | L2 软确认也快 | L2 软确认≠终局；我们的卖点是“用户看到 ✅ 时钱已经终局到账”，回执可立即被第三方复核 |
| 每 claim 一笔仍便宜 | gas 文档：ERC-20 转账 ~65k gas ≈ $0.00016（最低 base fee）【已验证】 | 批量一结更省 | 两种都支持；逐笔的价值是**每笔付款与一条证据一一对应**，争议时粒度最细 |
| 官方 agent 支付基础设施 | Monad x402 facilitator、`@monad-crypto/mpp`、测试网 USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3`【已验证】 | Base 也有 x402 | 承认；这是“合适”不是“唯一” |
| 吞吐：审计方批量回放上千条答案时，每条一张回执 | 150M gas/块 ÷ 0.3s ≈ 500M gas/s【已验证】 | 用不到那么多 | 是增长叙事，不是今天的核心 |

**弱点（主动说）**：核心价值（claim 级核实）与链无关；若按“每回答一结”，任何便宜 L2 都能做。Monad 让“逐 claim 实时终局结算 + 回执”最顺，但不是唯一可能。

**“为什么不用支付通道”**：① 收款方是**动态的多个来源**，每次回答都不同，事先开通道不现实；② 通道的核心价值是省链上费用，而在 Monad 上每笔 ~$0.0002，省下的不值得引入通道的复杂度；③ 我们要的是**公开可复核的每笔回执**，通道内凭证默认不公开。另：`@monad-crypto/mpp` 目前只有 charge（一次性），没有 session【已验证】。

---

## 7. Monad 技术事实（复用已验证信息）

| 项 | 值 | 来源/状态 |
|---|---|---|
| Testnet chainId | `10143`（`0x279f`） | 实测【已验证】 |
| RPC | `https://testnet-rpc.monad.xyz`（约 50 rps）；备用 `https://rpc-testnet.monadinfra.com` | docs testnet 页【已验证】 |
| 水龙头 | MON：https://faucet.monad.xyz ；USDC：Circle faucet（每次 1 USDC） | 【已验证】 |
| Testnet USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | https://docs.monad.xyz/guides/x402 |
| x402 facilitator | `https://x402-facilitator.molandak.org`（仅 x402 v2+） | https://docs.monad.xyz/tooling-and-infra/agentic-payments |
| Gas 计费 | **按 gas limit 收费**，不是 gas used → 显式设置 gas limit（估算 × 1.075 左右） | gas-pricing、wallet-developers 页【已验证】 |
| 单笔 gas 上限 | 30M；块上限 150M（“500M”是每秒吞吐） | summary 页【已验证】 |
| `eth_getLogs` | 公共 RPC 限 100 区块（实测超出返回 -32614）→ 事件查询分段，或前端直接用后端推送的 txHash | 【已验证】 |
| `debug_traceCall` | 测试网可用（实测）；本项目不依赖 | 【已验证】 |
| 无全局 mempool | 不用 `newPendingTransactions`；用 receipt + `finalized` tag 判断终局 | local-mempool / wallet-developers【已验证】 |
| 合约大小 | 128KB（本项目用不到） | differences【已验证】 |
| Solidity | 0.8.31 需 `evmVersion: "osaka"`（Foundry v1.8.0+ 开启 Monad 网络） | hardhat/foundry 文档【已验证】 |
| `eth_sendRawTransactionSync` | 文档提到“若 RPC 支持”可用 | 是否支持【未核实，开工时测】 |

**USDC 余额风险**：Circle faucet 每次只给 1 USDC。Demo 单价设 0.001–0.01 USDC 足够。兜底：部署 `MockUSDC`（6 decimals）并在 UI 标注。

---

## 8. 技术栈

- 运行时/后端：Bun + Hono（SSE 用 `streamSSE`）
- LLM：Vercel AI SDK `generateObject` + Zod（模型可配置）
- 链：viem（publicClient + walletClient）；Foundry 部署合约
- 前端：React + Vite + Tailwind
- 存储：本地 JSON 文件（证据 JSON 按 `evidenceHash` 命名存 `data/evidence/`），不引数据库
- 可选：x402 v2 SDK（`@x402/*`）、`@modelcontextprotocol/sdk`

---

## 9. 合约设计（最小）

`CiteEscrow.sol`（Solidity 0.8.31，evmVersion osaka）

```solidity
// 仅示意，非最终代码
struct Source { address payee; uint96 pricePerClaim; bytes32 contentHash; bool active; }
mapping(bytes32 => Source) public sources;            // sourceId => Source
mapping(bytes32 => uint256) public budget;             // answerId => 剩余预算
mapping(bytes32 => address) public payerOf;            // answerId => 付款方
mapping(bytes32 => bool) public claimDone;             // keccak(answerId, claimId) 防重复

function registerSource(bytes32 sourceId, address payee, uint96 price, bytes32 contentHash) external;
function deposit(bytes32 answerId, uint256 amount) external;               // USDC transferFrom
function settleClaim(bytes32 answerId, bytes32 claimId, bytes32 sourceId, bytes32 evidenceHash) external onlyOperator;
function flagClaim(bytes32 answerId, bytes32 claimId, bytes32 sourceId, uint8 verdict, bytes32 evidenceHash) external onlyOperator;
function closeAnswer(bytes32 answerId) external;                           // 退回余额

event SourceRegistered(bytes32 indexed sourceId, address payee, uint96 price, bytes32 contentHash);
event ClaimSettled(bytes32 indexed answerId, bytes32 claimId, bytes32 indexed sourceId, address payee, uint256 amount, uint256 fee, bytes32 evidenceHash);
event ClaimFlagged(bytes32 indexed answerId, bytes32 claimId, bytes32 indexed sourceId, uint8 verdict, bytes32 evidenceHash);
event AnswerClosed(bytes32 indexed answerId, uint256 refunded);
```

- 规则：`settleClaim` 金额 = `sources[sourceId].pricePerClaim`；平台费 `feeBps`（如 500 = 5%）。
- 信任假设（坦白）：operator 是中心化核实者；链上保证的是“付款与证据哈希绑定、可公开复核、不可篡改”，**不保证判定正确**。去中心化验证（多验证者/质押）列入路线图。
- 兜底方案（合约写不完时）：不用托管，后端钱包直接 `USDC.transfer` + 一个极简 `Receipts` 合约只发 `ClaimSettled` 事件；或把 `evidenceHash` 放入转账 tx 的 calldata 后缀【简化，UI 标注】。

---

## 10. API 与 Zod Schema

### 10.1 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/sources` | 已注册来源列表（含链上状态） |
| POST | `/answer` | SSE：生成答案 → 逐 claim 推送 verdict → 推送结算 tx |
| POST | `/verify` | 输入 `{claims, sources}` 只做核实，不结算（Eval 和 `/audit` 复用） |
| POST | `/audit` | 可选：批量核实外部答案，输出报告（场景 2） |
| GET | `/receipt/:evidenceHash` | 证据 JSON + 对应链上事件 |
| GET | `/eval` | 最近一次评测结果 |

### 10.2 Schema（示意）

```ts
import { z } from "zod";

export const Verdict = z.enum(["SUPPORTED", "CONTRADICTED", "UNSUPPORTED"]);

export const Source = z.object({
  sourceId: z.string(),              // 人类可读 id；上链用 keccak256(sourceId)
  title: z.string(),
  publisher: z.string(),
  url: z.string().url().optional(),
  isOriginal: z.boolean(),           // false = 转载站
  payee: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  pricePerClaim: z.string(),         // USDC 最小单位字符串
  contentHash: z.string(),           // keccak256(正文 UTF-8)
});

export const DraftClaim = z.object({ // LLM 生成阶段输出
  id: z.string(),
  text: z.string().min(5).max(400),
  sourceId: z.string(),
  quote: z.string().min(8).max(500), // 必须逐字来自 source 正文
});

export const DraftAnswer = z.object({
  answer: z.string(),
  claims: z.array(DraftClaim).min(1).max(8),
});

export const Judgement = z.object({  // LLM 判定阶段输出
  verdict: Verdict,
  rationale: z.string().max(400),
  supportingQuote: z.string().optional(), // 判定所依据的原文片段（同样要硬校验）
});

export const VerifiedClaim = DraftClaim.extend({
  hardChecks: z.object({
    sourceRegistered: z.boolean(),
    quoteIsSubstring: z.boolean(),
    quoteStart: z.number().int().nonnegative().optional(),
    supportingQuoteIsSubstring: z.boolean().optional(),
  }),
  verdict: Verdict,                  // 硬校验失败 → 强制 UNSUPPORTED
  rationale: z.string(),
  evidenceHash: z.string(),
  settlement: z.object({
    action: z.enum(["PAID", "FLAGGED", "SKIPPED"]),
    txHash: z.string().optional(),
    amount: z.string().optional(),
    finalized: z.boolean().default(false),
  }).optional(),
});

export const Evidence = z.object({   // 链下存储；keccak256(canonicalJSON) = evidenceHash
  version: z.literal(1),
  answerId: z.string(),
  claim: VerifiedClaim.omit({ settlement: true, evidenceHash: true }),
  sourceContentHash: z.string(),
  contextWindow: z.string(),         // quote 前后各 300 字符
  model: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
});

export const SseEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("answer"), answerId: z.string(), answer: z.string() }),
  z.object({ type: z.literal("claim"), claim: VerifiedClaim }),
  z.object({ type: z.literal("settled"), claimId: z.string(), txHash: z.string() }),
  z.object({ type: z.literal("finalized"), claimId: z.string(), blockNumber: z.string() }),
  z.object({ type: z.literal("done"), refundTx: z.string().optional() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
```

---

## 11. 核实流水线与硬校验

### 11.1 流程
1. **生成**：LLM 只能引用检索给它的来源；输出 `DraftAnswer`。
2. **硬校验（确定性代码，先于 LLM 判定）**
   - H1 `sourceId` 已注册且 active；
   - H2 `quote` 归一化后（统一空白、引号、大小写不变）是来源正文的**子串**，记录 `quoteStart`；
   - H3 quote 长度 8–500 字符；同一回答内 claim id 唯一；
   - H4 来源 `contentHash` 与链上注册一致（防内容被偷换）；
   - 任一失败 → verdict 强制 `UNSUPPORTED`，`action=SKIPPED`，不调用判定模型。
3. **语义判定**：输入 = claim 文本 + quote + quote 前后各 300 字符上下文；输出 `Judgement`。
   - 若给出 `supportingQuote`，同样做子串校验，失败 → 降级 `UNSUPPORTED`。
4. **结算规则（代码决定，不由 LLM 决定）**
   - SUPPORTED + 全部硬校验通过 → `settleClaim`
   - CONTRADICTED → `flagClaim`（verdict=1），不付款
   - UNSUPPORTED → 默认只记链下（可选 `flagClaim` verdict=2）
   - 预算不足 → `SKIPPED` 并提示
5. **证据**：canonical JSON → `keccak256` → 存 `data/evidence/<hash>.json` → 哈希上链。

### 11.2 判定提示词大纲
- **baseline A（仅子串）**：不调用 LLM；quote 是子串即视为 SUPPORTED。（= Obolus 式门槛的近似）
- **baseline B（简单提示）**：“这条引用是否支持这个 claim？回答 SUPPORTED/CONTRADICTED/UNSUPPORTED。”
- **ours（优化）**：
  - 明确定义三类：SUPPORTED = 上下文**蕴含** claim 的每个事实要素（数字、方向、主体、时间）；CONTRADICTED = 上下文与任一要素冲突；UNSUPPORTED = 既不蕴含也不冲突（含“话题相关但没说这件事”）。
  - 先把 claim 拆成原子事实，逐条对照，再汇总（任一冲突 → CONTRADICTED；任一缺失 → UNSUPPORTED）。
  - 要求给出 `supportingQuote`（逐字），否则不得判 SUPPORTED。
  - 特别规则：数字/单位/方向（上升/下降）/否定词/时间范围必须一致；转载站归因不改变 verdict，但记录 `isOriginal=false`。

---

## 12. 评测计划

### 12.1 标注集（~20 条，Tow Center 风格）
每条 = `{ claim, sourceId, quote, gold: Verdict, category }`，来源为 repo 内置文本。

| 类别 | 数量 | 说明（baseline A 必错的标★） |
|---|---|---|
| 正确支持 | 5 | quote 支持 claim |
| ★数字篡改 | 3 | quote 原文正确（子串成立），claim 把 32% 写成 23% |
| ★方向反转 | 3 | “下降”写成“上升” / 否定词丢失 |
| ★断章取义 | 3 | quote 是子串，但上下文表明是反驳/假设语气 |
| ★相关但未说 | 3 | quote 是子串，话题相关但不支撑 claim |
| 伪造引文 | 2 | quote 不在原文（子串失败） |
| 转载站归因 | 1–2 | 内容一致但来源是转载（verdict 可 SUPPORTED，标记非原创） |

### 12.2 指标
- 三分类 accuracy、每类 precision/recall/F1（重点：CONTRADICTED recall）
- **误付率** = 判 SUPPORTED 但 gold ≠ SUPPORTED 的比例（= 付了不该付的钱）
- **漏付率** = gold SUPPORTED 但未付
- 每 claim 延迟（判定耗时 + 上链到终局耗时，分开报）
- 对比：baseline A / baseline B / ours；输出 `eval/results.json` + 前端表格

### 12.3 预期叙事（Demo 里说的话）
“仅子串校验会把 ★ 类全部判成 SUPPORTED 并付钱——误付率 X%；我们降到 Y%。” X/Y 以实际运行结果为准，**不得预填**。

### 12.4 失败案例迭代
跑完 → 列出 ours 错判样本 → 改一条提示词规则或硬校验 → 重跑 → 记录版本（`promptVersion`）。时间不够就只迭代一轮。

---

## 13. UI

单页三栏：
1. **左**：问题输入、预算（USDC）、钱包/托管余额、来源列表（原创/转载徽章、单价）。
2. **中**：答案文本；下方 claim 卡片**逐条出现**：verdict 徽章（绿/红/灰）、claim、quote（高亮原文位置）、理由；付款状态 `pending → settled → finalized(xx ms)`，tx 链接（测试网浏览器）。
3. **右**：本次回答汇总（已付/已标记/退回）+ “Eval”标签页：三种方法指标对比表、错判样例。

---

## 14. 3 分钟 Demo 脚本

| 时间 | 画面 | 台词要点 |
|---|---|---|
| 0:00–0:25 | Tow Center 数据一页 | “AI 搜索 >60% 答错，DeepSeek 200 次里 115 次归错来源。可平台给出版商分钱，依据是‘被引用了几次’。” |
| 0:25–0:40 | 产品首页 | “CiteAudit：每一笔付款背后都有一条核实过的证据。” |
| 0:40–1:40 | 提问 → claim 卡片逐条出现 | 两条 SUPPORTED → 出现 tx，“~600ms 终局，钱已经到研报作者”；一条 CONTRADICTED（数字被篡改）→ 红色，“引文是真实子串，但说反了——不付钱，链上记一笔标记”。 |
| 1:40–2:10 | 点开回执 | evidenceHash ↔ 链上事件 ↔ 证据 JSON（claim、quote、上下文、模型版本），“任何第三方可以复核”。 |
| 2:10–2:40 | Eval 页 | “仅子串（≈Obolus 门槛）误付 X%，我们 Y%；CONTRADICTED 召回 Z%。” |
| 2:40–3:00 | 角色图 | “来源方被正确使用才收钱；付款方只为真正用到的内容付钱；出版商联盟拿它审计平台自报数据。下一步：访谈 5 家出版商/数据 API。” |

预录兜底：提前录一遍完整流程（防 RPC/LLM 现场故障）。

---

## 15. 评委 Q&A

- **和 Obolus/Keryx/CitePay 有什么不同？**
  它们的门槛是“引文存在/相关”（Obolus 是逐字子串，CitePay 是语义相关度）。子串成立≠支持论断：数字篡改、方向反转、断章取义都能通过子串门。我们做三分类语义核实并抓 CONTRADICTED，且用标注集量化了差距（Eval 页数字）。
- **为什么不用支付通道/链下记账？**
  收款方动态且多个；Monad 每笔 ~$0.0002，通道省的钱不值复杂度；我们要每笔公开可复核的回执。Monad 官方 MPP 包目前也只有 charge 没有 session。
- **为什么是 Monad？**
  600ms 完全终局 + 极低单笔费用，让“逐 claim、答案还在流、钱已终局”成立；官方 x402 facilitator 和测试网 USDC。坦白：核实层与链无关，Monad 是最合适的结算层，不是唯一可能。
- **谁付钱？**
  短期最可能：出版商/联盟为**独立审计**付费（场景 2）；中期：付费数据 API 要求接入方按 SUPPORTED 计费（场景 1/3）。付款方自愿性是我们最大的假设，赛后第一件事是访谈验证。
- **LLM 判错怎么办？谁来监督判定者？**
  硬校验在前；LLM 不定金额；每笔有证据可复核；有申诉事件与补付；判错样本进评测集。去中心化多验证者在路线图。
- **AI 平台为什么要接？**
  不一定接。审计场景不需要平台配合（出版商自己构造查询，Tow Center 就是这么做的）。
- **成本？**
  每 claim 一次判定调用 + 一笔链上 tx（~65k–100k gas，按 gas limit 计费，显式设置 limit）。

---

## 16. 时间计划（12:00–18:30）与砍线

| 时间 | 任务 | 完成标准 |
|---|---|---|
| 12:00–12:30 | 仓库脚手架（Bun+Hono / Vite+React / Foundry）；RPC 冒烟；领 MON + USDC；测 `eth_sendRawTransactionSync` | `/health` 通；钱包有余额 |
| 12:30–13:20 | `CiteEscrow.sol` + 部署脚本 + 注册 3–5 个来源 | 测试网地址、`SourceRegistered` 事件 |
| 13:20–14:20 | 来源库 + 检索 + `generateObject` 生成 claims + 硬校验 | `/verify` 对固定输入返回结果 |
| 14:20–15:10 | 语义判定（ours + baseline B）+ 证据哈希 | 单测：数字篡改样例判 CONTRADICTED |
| 15:10–15:50 | 结算器 + SSE 推送 | 一次回答在链上出现 ≥2 个 `ClaimSettled` |
| **砍线 1（15:50）** | 合约有问题 → 切换到“直接 USDC.transfer + Receipts 事件合约” | |
| 15:50–16:40 | 前端 claim 卡片流 + 回执页 | 端到端可演示 |
| 16:40–17:30 | 标注集 20 条 + eval 脚本 + Eval 页 | `eval/results.json` 三方法对比 |
| **砍线 2（17:30）** | Eval 不够 20 条 → 12 条也上；`/audit`、x402、申诉全部砍 | |
| 17:30–18:00 | README、录屏兜底、部署地址写进 README | |
| 18:00–18:30 | 彩排 3 次、修 bug | 3 分钟内跑完 |

---

## 17. 风险与兜底

| 风险 | 兜底 |
|---|---|
| RPC 限流/故障 | 备用 RPC；结算串行 + nonce 本地管理；失败重试 1 次 |
| USDC 不够（faucet 每次 1 USDC） | 单价 0.001–0.01；或部署 `MockUSDC` 并在 UI 标注 |
| 每 claim 一笔 tx 太慢/nonce 冲突 | 单钱包串行队列；或改成“每回答一笔批量 + 每 claim 一个事件”（UI 说明） |
| gas 按 limit 收费导致浪费 | 显式 gas limit：`estimateGas × 1.075` |
| LLM 慢/不稳定 | 判定并发 3；超时 → UNSUPPORTED；离线 fixtures 模式 `OFFLINE_FIXTURES=1` |
| 判定质量不如预期 | 如实报告指标；Demo 讲“我们量化出来了”，不夸大 |
| 现场网络挂 | 预录视频 |
| 被问“这不就是 Obolus” | §15 第一条 + Eval 数字 |

---

## 18. 赛后验证计划

1. **访谈 5 家**（出版商 2、付费数据 API/研报 2、出版商联盟或法律数据库 1），问题：
   - 现在从 AI 平台拿到的使用/引用报表是什么样？信不信？
   - 被错误引用/歪曲时怎么发现、怎么处理？
   - 愿不愿意为“独立引用审计报告”付费？多少钱/月？
   - 愿不愿意改成“只有被正确使用才收费”？
2. **成功标准**：≥2 家愿意给真实样本做审计试点；≥1 家给出明确付费意向。
3. **否则转向**：纯 Web2 的引用审计 SaaS（链上只做可选锚定），或回到 TabbyML 式评测产品。
4. 路线图：去中心化验证（多模型/多验证者 + 质押）、x402 按次审计 API、MCP 工具、主网。

---

## 19. Notes for Cursor

### 规则
- **今天从零写代码**；不复制旧项目代码。仓库公开（MIT）。
- TypeScript strict；所有外部输入（LLM 输出、HTTP body、RPC 返回）用 Zod 解析。
- **LLM 不得决定金额或绕过硬校验**；金额只来自链上 `pricePerClaim`。
- USDC 用 `bigint` 最小单位（6 decimals），禁止浮点。
- 所有 tx 显式设置 `gas`（Monad 按 gas limit 收费）；终局用 receipt + `finalized` tag 判断。
- 不用 `newPendingTransactions`；事件查询若用 `getLogs` 必须 ≤100 区块分段。
- 秘钥只放 `.env`（`OPERATOR_PRIVATE_KEY`、`LLM_API_KEY`），`.env.example` 提交，`.env` 进 `.gitignore`。

### 目录
```
cite-audit/
├── README.md                 # 一句话、Demo 视频、合约地址、如何运行、Eval 结果
├── PROJECT.md                # 本文档
├── .env.example              # MONAD_RPC_URL, MONAD_RPC_FALLBACK_URL, OPERATOR_PRIVATE_KEY, ESCROW_ADDRESS, USDC_ADDRESS, LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, OFFLINE_FIXTURES
├── contracts/                # Foundry
│   ├── src/CiteEscrow.sol
│   ├── src/MockUSDC.sol      # 兜底
│   ├── script/Deploy.s.sol
│   └── test/CiteEscrow.t.sol
├── server/                   # Bun + Hono
│   ├── src/index.ts          # 路由、SSE
│   ├── src/schemas.ts        # §10 Zod
│   ├── src/sources/          # 内置来源 .md + registry.ts
│   ├── src/retrieve.ts
│   ├── src/generate.ts       # generateObject → DraftAnswer
│   ├── src/hardChecks.ts     # H1–H4
│   ├── src/judge.ts          # baselineA / baselineB / ours
│   ├── src/evidence.ts       # canonical JSON + keccak256 + 存储
│   ├── src/chain/client.ts   # viem 主备 RPC
│   ├── src/chain/settle.ts   # 串行队列、gas、finalized
│   └── src/prompts/          # 版本化提示词（promptVersion）
├── eval/
│   ├── cases.json            # ~20 条标注
│   ├── run.ts                # 三方法对比 → results.json
│   └── results.json
└── web/                      # React + Vite + Tailwind
    └── src/{App.tsx, ClaimCard.tsx, Receipt.tsx, EvalTable.tsx}
```

### 提交节奏
每完成 §16 的一行就提交一次（commit 历史也是“今天从零写”的证据）。
