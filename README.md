# CiteAudit

每一笔付款背后都有一条核实过的证据。Monad 测试网上的演示用 MockUSDC。

## 已部署

- 操作员：`0x270dA48Fe6B3Db7b4cf3454eb88F57efC73641E4`
- MockUSDC：`0x068af1afc9e6ab9492c396d7d953d1f5ae7689cf`
- CiteEscrow：`0xb82b287215a41d9cf3837373aba4db85d6b7b29d`
- 浏览器：https://testnet.monadexplorer.com

## 本地运行

```bash
cd server && bun test && bun src/index.ts
cd web && bun install && bun run dev
```

服务端默认端口 8787 时，把 `PORT=8787` 配上，页面代理才会打到它。提问用「北岚科技毛利率」。预算 `5000` 会带上已经终局的两笔付款和一笔拒付交易。

私钥放在本地 `.env`，不要提交。
