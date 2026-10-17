import { z } from "zod";
import type { SourceRecord } from "./hardChecks.ts";
import { baselineBPrompt, oursPrompt, PROMPT_VERSION } from "./prompts/ours.ts";
import type { Judge, VerifyMethod } from "./verify.ts";

const JudgementSchema = z.object({
  verdict: z.enum(["SUPPORTED", "CONTRADICTED", "UNSUPPORTED"]),
  rationale: z.string().max(400).optional().default(""),
  supportingQuote: z.string().max(500).optional(),
});

export function parseJudgement(content: string): z.infer<typeof JudgementSchema> {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const jsonText = fenced?.[1]?.trim() ?? trimmed;
  const parsed: unknown = JSON.parse(jsonText);
  return JudgementSchema.parse(parsed);
}

export function contextWindow(body: string, quote: string, radius = 300): string {
  const at = body.indexOf(quote.trim());
  if (at < 0) return body.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(body.length, at + quote.trim().length + radius);
  return body.slice(start, end);
}

export function createModelJudge(options: {
  apiKey: string;
  model: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}): Judge {
  const endpoint = options.endpoint ?? "https://open.bigmodel.cn/api/paas/v4/chat/completions";
  const fetchImpl = options.fetchImpl ?? fetch;
  return async ({ claim, source, method }) => {
    const prompt = renderPrompt(method, claim.text, claim.quote, source);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`模型请求失败：${response.status}`);
    const payload: unknown = await response.json();
    const content = readContent(payload);
    return parseJudgement(content);
  };
}

export function renderPrompt(method: VerifyMethod, claim: string, quote: string, source: SourceRecord): string {
  const input = { claim, quote, context: contextWindow(source.body, quote) };
  if (method === "ours") return oursPrompt(input);
  return baselineBPrompt(input);
}

function readContent(payload: unknown): string {
  const parsed = z
    .object({
      choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
    })
    .parse(payload);
  return parsed.choices[0]?.message.content ?? "";
}

export { PROMPT_VERSION };
