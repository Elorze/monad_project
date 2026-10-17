import { keccak256, toBytes } from "viem";

export type SourceRecord = {
  sourceId: string;
  body: string;
  active: boolean;
  contentHash: `0x${string}`;
};

export type DraftClaim = {
  id: string;
  text: string;
  sourceId: string;
  quote: string;
};

export type HardCheckResult = {
  claimId: string;
  ok: boolean;
  sourceRegistered: boolean;
  quoteIsSubstring: boolean;
  quoteStart?: number;
  contentHashMatches: boolean;
  failures: string[];
};

const QUOTE_CHARS: Record<string, string> = {
  "\u201c": '"',
  "\u201d": '"',
  "\u2018": "'",
  "\u2019": "'",
  "\u300c": '"',
  "\u300d": '"',
  "\u300e": '"',
  "\u300f": '"',
  "\u00a0": " ",
  "\u3000": " ",
};

export function contentHashOf(body: string): `0x${string}` {
  return keccak256(toBytes(body));
}

export function checkClaims(claims: DraftClaim[], sources: ReadonlyMap<string, SourceRecord>): HardCheckResult[] {
  const counts = new Map<string, number>();
  for (const claim of claims) {
    counts.set(claim.id, (counts.get(claim.id) ?? 0) + 1);
  }
  return claims.map((claim) => checkOne(claim, sources.get(claim.sourceId), (counts.get(claim.id) ?? 0) > 1));
}

function checkOne(claim: DraftClaim, source: SourceRecord | undefined, duplicate: boolean): HardCheckResult {
  const failures: string[] = [];
  const sourceRegistered = source !== undefined && source.active;
  if (!sourceRegistered) failures.push("source");

  const trimmed = claim.quote.trim();
  const quoteLength = [...trimmed].length;
  if (quoteLength < 8 || quoteLength > 500) failures.push("length");
  if (duplicate) failures.push("duplicate");

  let quoteIsSubstring = false;
  let quoteStart: number | undefined;
  let contentHashMatches = false;

  if (source) {
    contentHashMatches = contentHashOf(source.body) === source.contentHash;
    if (!contentHashMatches) failures.push("hash");
    const found = findQuote(source.body, trimmed);
    if (found !== undefined) {
      quoteIsSubstring = true;
      quoteStart = found;
    } else {
      failures.push("quote");
    }
  } else {
    failures.push("quote");
    failures.push("hash");
  }

  return {
    claimId: claim.id,
    ok: failures.length === 0,
    sourceRegistered,
    quoteIsSubstring,
    quoteStart,
    contentHashMatches,
    failures,
  };
}

export function quoteAppearsIn(body: string, quote: string): boolean {
  return findQuote(body, quote) !== undefined;
}

function findQuote(body: string, quote: string): number | undefined {
  const source = normalize(body);
  const needle = normalize(quote);
  if (needle.text.length === 0) return undefined;
  const at = source.text.indexOf(needle.text);
  if (at < 0) return undefined;
  return source.starts[at];
}

function normalize(input: string): { text: string; starts: number[] } {
  let text = "";
  const starts: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i] ?? "";
    const mapped = QUOTE_CHARS[raw] ?? raw;
    if (/\s/u.test(mapped)) continue;
    text += mapped;
    starts.push(i);
  }
  return { text, starts };
}
