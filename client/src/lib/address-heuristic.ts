export function looksLikeStreetAddress(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  if (raw.length === 0) return true;
  if (raw.length < 5) return false;

  const hasDigit = /\d/.test(raw);

  const letterTokens = raw
    .split(/[\s,./\\-]+/)
    .filter((tok) => /[A-Za-z\u0590-\u05FF]/.test(tok));
  const letterWordCount = letterTokens.filter((tok) => tok.length >= 2).length;

  return hasDigit && letterWordCount >= 1;
}
