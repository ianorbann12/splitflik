// Pure request/response validation for the receipt parser (PLAN.md §7).
// Underscore prefix: not a Vercel function; imported by parse-receipt.ts and
// unit-tested directly.

export interface ParsedItem {
  label: string;
  quantity: number;
  totalCents: number;
}

export interface ParseRequest {
  image: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ParseResult {
  items: ParsedItem[];
  totalCents: number | null;
}

/** ~4.5 MB of binary as base64 — matches Vercel's request body ceiling. */
export const MAX_BASE64_LENGTH = 6_000_000;

const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ITEMS = 100;
const MAX_LABEL = 80;
const MAX_ITEM_CENTS = 1_000_000; // 10.000 €
const MAX_TOTAL_CENTS = 10_000_000;

export function validateRequest(body: unknown): ParseRequest | 'too_large' | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const image = b['image'];
  const mediaType = b['mediaType'];
  if (typeof image !== 'string' || typeof mediaType !== 'string') return null;
  if (!MEDIA_TYPES.has(mediaType)) return null;
  if (image.length > MAX_BASE64_LENGTH) return 'too_large';
  if (image.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return null;
  return { image, mediaType: mediaType as ParseRequest['mediaType'] };
}

/**
 * Re-validates the model's tool output: integer cents, clamped strings and
 * quantities, at most 100 items. Returns null when the shape is unusable;
 * an empty items list means "not a readable receipt".
 */
export function sanitizeResult(input: unknown): ParseResult | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw['items'])) return null;

  const items: ParsedItem[] = [];
  for (const entry of (raw['items'] as unknown[]).slice(0, MAX_ITEMS)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const label = typeof e['label'] === 'string' ? e['label'].trim().slice(0, MAX_LABEL) : '';
    const totalCents = e['totalCents'];
    if (!label) continue;
    if (typeof totalCents !== 'number' || !Number.isInteger(totalCents)) continue;
    if (totalCents < 1 || totalCents > MAX_ITEM_CENTS) continue;
    const rawQuantity = e['quantity'];
    const quantity =
      typeof rawQuantity === 'number' && Number.isInteger(rawQuantity)
        ? Math.min(99, Math.max(1, rawQuantity))
        : 1;
    items.push({ label, quantity, totalCents });
  }

  const rawTotal = raw['totalCents'];
  const totalCents =
    typeof rawTotal === 'number' &&
    Number.isInteger(rawTotal) &&
    rawTotal >= 1 &&
    rawTotal <= MAX_TOTAL_CENTS
      ? rawTotal
      : null;

  return { items, totalCents };
}
