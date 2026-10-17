# 演示提示词（直接整段贴给 Cursor Agent）

先读仓库里的 `fixtures/civil-code.json`。那是《民法典》第 1032–1035 条原文。

然后做且只做下面这件事：

1. 根据这四条原文，写一段关于隐私权 / 个人信息处理的意见（一两百字即可）。
2. **必须先调用 MCP 工具 `verify_and_settle`，不要自己判断该不该付钱。**
3. 调用时传入：
   - `sources`：直接用 `fixtures/civil-code.json` 里的四段
   - `answer`：你刚写的整段意见
   - `claims`：把意见拆成 2–4 条说法；每条必须带 `text`、`sourceId`、`quote`；`quote` 必须是对应条文里连续抄下来的原句
   - `budget`：`"5000"`
4. 根据工具返回的结果向我汇报：哪几条 SUPPORTED（付了多少、有没有 `txHash`），哪几条 CONTRADICTED / UNSUPPORTED（为什么不付）。
5. 不要改合约，不要自己编造交易哈希。

如果工具还没连上，先说「请启用 CiteAudit MCP」，不要假装已经核对过。
