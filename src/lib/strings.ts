// Minimal shared strings for the SDK. Frontends bring their own UI copy;
// the reference app's full Slovenian string set lives on the `app` branch.

/** Slovenian pluralization: 1 izlet, 2 izleta, 3–4 izleti, 5+ izletov. */
export function plural(
  n: number,
  forms: readonly [string, string, string, string],
): string {
  const r = n % 100;
  const idx = r === 1 ? 0 : r === 2 ? 1 : r === 3 || r === 4 ? 2 : 3;
  return `${n} ${forms[idx]}`;
}

export const STR = {
  appName: 'SplitFlik',
  saveFailed: 'Shranjevanje ni uspelo. Poskusi znova.',
  loadFailed: 'Nalaganje ni uspelo.',
} as const;
