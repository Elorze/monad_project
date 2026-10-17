import { readFileSync } from "node:fs";
import { z } from "zod";
import { contentHashOf, type DraftClaim, type SourceRecord } from "./hardChecks.ts";
import type { Judge, Judgement } from "./verify.ts";

const FILES = [
  { sourceId: "cc-1032", title: "民法典第1032条", file: "cc-1032.md" },
  { sourceId: "cc-1033", title: "民法典第1033条", file: "cc-1033.md" },
  { sourceId: "cc-1034", title: "民法典第1034条", file: "cc-1034.md" },
  { sourceId: "cc-1035", title: "民法典第1035条", file: "cc-1035.md" },
] as const;

const CapturedSchema = z.object({
  model: z.string(),
  ranAt: z.string(),
  opinion: z.string(),
  claims: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      sourceId: z.string(),
      quote: z.string(),
      verdict: z.enum(["SUPPORTED", "CONTRADICTED", "UNSUPPORTED"]),
      rationale: z.string(),
    }),
  ),
});

const captured = CapturedSchema.parse(JSON.parse(readFileSync(new URL("../../eval/captured-legal.json", import.meta.url), "utf8")));

function beijing(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}（北京时间）`;
}

export const LEGAL_OPINION = captured.opinion;
export const LEGAL_DISCLAIMER = `这段意见由 ${captured.model} 在 ${beijing(captured.ranAt)} 根据民法典第1032条至第1035条生成，并用同一模型核对后存档。不是事先写好的错例，也不是法律意见。`;

const JUDGEMENTS: Record<string, Judgement> = Object.fromEntries(
  captured.claims.map((claim) => [
    claim.id,
    {
      verdict: claim.verdict,
      rationale: claim.rationale,
      supportingQuote: claim.verdict === "SUPPORTED" ? claim.quote : undefined,
    },
  ]),
);

export async function loadLegalPassages(): Promise<Array<{ sourceId: string; title: string; body: string }>> {
  const passages = [];
  for (const item of FILES) {
    const body = (await Bun.file(new URL(`./sources/${item.file}`, import.meta.url)).text()).replace(/\r\n/g, "\n").trim();
    passages.push({ sourceId: item.sourceId, title: item.title, body });
  }
  return passages;
}

export function legalClaims(): DraftClaim[] {
  return captured.claims.map((claim) => ({
    id: claim.id,
    text: claim.text,
    sourceId: claim.sourceId,
    quote: claim.quote,
  }));
}

export async function legalSourceMap(): Promise<Map<string, SourceRecord>> {
  const passages = await loadLegalPassages();
  return new Map(
    passages.map((passage) => [
      passage.sourceId,
      {
        sourceId: passage.sourceId,
        body: passage.body,
        active: true,
        contentHash: contentHashOf(passage.body),
      },
    ]),
  );
}

export function legalPrices(): Map<string, string> {
  return new Map(FILES.map((item) => [item.sourceId, "1000"]));
}

export const legalJudge: Judge = async ({ claim }) => {
  const found = JUDGEMENTS[claim.id];
  if (!found) throw new Error(`没有法律样例判定：${claim.id}`);
  return found;
};
