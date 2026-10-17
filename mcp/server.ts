import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SourceSchema = z.object({
  sourceId: z.string().describe("来源 id，例如 cc-1032"),
  title: z.string().optional(),
  body: z.string().describe("原文正文"),
});

const ClaimSchema = z.object({
  id: z.string().optional().describe("可选 claim id"),
  text: z.string().describe("这条说法的文字"),
  sourceId: z.string().describe("对应 sources 里的 sourceId"),
  quote: z.string().describe("必须是原文里的连续子串"),
});

const server = new McpServer({ name: "citeaudit", version: "0.1.0" });

server.registerTool(
  "verify_and_settle",
  {
    description:
      "对着若干段原文核对 Agent 写好的意见。只有 SUPPORTED 才会付款；CONTRADICTED / UNSUPPORTED 不付。结果会写到本地服务，网页可刷新看到同一份判定。",
    inputSchema: {
      sources: z.array(SourceSchema).min(1),
      answer: z.string().min(1).describe("Agent 写好的整段意见"),
      claims: z.array(ClaimSchema).min(1).describe("意见拆成的 claim 列表，每条必须带原文 quote"),
      budget: z.string().regex(/^\d+$/).optional().describe("托管预算，默认 5000"),
    },
  },
  async ({ sources, answer, claims, budget }) => {
    const base = process.env.CITE_AUDIT_URL ?? "http://127.0.0.1:8787";
    const response = await fetch(`${base}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources, answer, claims, budget: budget ?? "5000" }),
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `核对失败（${response.status}）：${text}` }],
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
