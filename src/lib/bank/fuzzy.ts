/**
 * Lightweight fuzzy text helpers for bank reconciliation matching.
 * No external dependencies — uses normalized substring + token Levenshtein.
 */

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compact form for invoice numbers (remove separators). */
export function compactText(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(row[j] + 1, prev + 1, row[j - 1] + cost);
      row[j - 1] = prev;
      prev = next;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function similarityRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  const dist = levenshtein(a, b);
  return Math.round((1 - dist / maxLen) * 100);
}

function tokenSimilarity(a: string, b: string): number {
  const tokensA = normalizeText(a).split(" ").filter(Boolean);
  const tokensB = normalizeText(b).split(" ").filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return similarityRatio(compactText(a), compactText(b));
  }

  let best = 0;
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      best = Math.max(best, similarityRatio(ta, tb));
      if (best >= 95) return best;
    }
  }
  return best;
}

/**
 * Score 0–100 for whether `needle` appears in `haystack` (reference text).
 * Checks normalized substring, compact substring, and best token similarity.
 */
export function fuzzyIncludes(
  haystack: string | null | undefined,
  needle: string | null | undefined,
): number {
  const hay = normalizeText(haystack);
  const ned = normalizeText(needle);
  if (!hay || !ned) return 0;

  if (hay.includes(ned)) return 100;

  const hayCompact = compactText(haystack);
  const nedCompact = compactText(needle);
  if (nedCompact.length >= 4 && hayCompact.includes(nedCompact)) return 95;

  const tokenScore = tokenSimilarity(hay, ned);
  if (tokenScore >= 80) return tokenScore;

  // Sliding window over compact haystack for typos in invoice numbers
  if (nedCompact.length >= 4 && hayCompact.length >= nedCompact.length) {
    let best = 0;
    for (let i = 0; i <= hayCompact.length - nedCompact.length; i++) {
      const slice = hayCompact.slice(i, i + nedCompact.length);
      best = Math.max(best, similarityRatio(slice, nedCompact));
      if (best >= 90) return best;
    }
    return best;
  }

  return tokenScore;
}

/**
 * Score 0–100 similarity between two labels (e.g. counterparty vs client name).
 */
export function fuzzySimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 95;

  const compactScore = similarityRatio(compactText(a), compactText(b));
  const tokenScore = tokenSimilarity(na, nb);
  return Math.max(compactScore, tokenScore);
}

/** Best similarity against several candidate names. */
export function fuzzyBestSimilarity(
  value: string | null | undefined,
  candidates: (string | null | undefined)[],
): number {
  let best = 0;
  for (const c of candidates) {
    best = Math.max(best, fuzzySimilarity(value, c));
  }
  return best;
}
