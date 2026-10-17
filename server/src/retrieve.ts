import type { RegisteredSource } from "./sources/registry.ts";

export function retrieve(query: string, sources: RegisteredSource[], limit = 3): RegisteredSource[] {
  const needle = bigrams(query);
  return sources
    .map((source) => ({ source, score: scoreText(`${source.title}\n${source.body}`, needle) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.source);
}

function scoreText(text: string, needle: string[]): number {
  if (needle.length === 0) return 0;
  const hay = new Set(bigrams(text));
  let score = 0;
  for (const gram of needle) {
    if (hay.has(gram)) score += 1;
  }
  return score;
}

function bigrams(input: string): string[] {
  const compact = input.replace(/\s+/g, "");
  const grams: string[] = [];
  for (let i = 0; i < compact.length - 1; i++) {
    grams.push(compact.slice(i, i + 2));
  }
  return grams;
}
