// Client side of the one HTTP boundary: downscale the photo, POST it to
// /api/parse-receipt, and hand back structured line items. Falls back to a
// fixture when the endpoint isn't reachable (local dev / demo) so the flow is
// always demonstrable. The API contract is { image: <base64>, mediaType } →
// { items: [{ label, quantity, totalCents }], totalCents | null } (docs/API.md).
import { mode } from './store';

export interface ReceiptLine {
  label: string;
  quantity: number;
  totalCents: number;
}

export interface ReceiptParse {
  items: ReceiptLine[];
  totalCents: number | null;
  /** True when the fixture was used instead of a live parse. */
  mocked: boolean;
}

type Media = 'image/jpeg' | 'image/png' | 'image/webp';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downscale(file: File): Promise<{ image: string; mediaType: Media }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.split(',')[1] ?? '';
    return { image: base64, mediaType: 'image/jpeg' };
  } finally {
    bitmap.close?.();
  }
}

function fixture(): ReceiptParse {
  return {
    items: [
      { label: 'Kruh črni', quantity: 1, totalCents: 129 },
      { label: 'Mleko 1L', quantity: 2, totalCents: 258 },
      { label: 'Jabolka', quantity: 1, totalCents: 199 },
      { label: 'Sir Edamec', quantity: 1, totalCents: 349 },
      { label: 'Voda 1,5L', quantity: 6, totalCents: 354 },
    ],
    totalCents: 1289,
    mocked: true,
  };
}

/**
 * Parses a receipt photo. In demo mode (or if the endpoint is unreachable),
 * returns a fixture so the flow still works end-to-end.
 */
export async function parseReceipt(file: File): Promise<ReceiptParse> {
  if (mode === 'demo') {
    await sleep(900);
    return fixture();
  }
  try {
    const { image, mediaType } = await downscale(file);
    const res = await fetch('/api/parse-receipt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image, mediaType }),
    });
    if (!res.ok) throw new Error(`parse failed: ${res.status}`);
    const json: unknown = await res.json();
    if (
      typeof json !== 'object' ||
      json === null ||
      !Array.isArray((json as { items?: unknown }).items)
    ) {
      throw new Error('unexpected response shape');
    }
    const body = json as { items: ReceiptLine[]; totalCents: number | null };
    return { items: body.items, totalCents: body.totalCents ?? null, mocked: false };
  } catch {
    await sleep(300);
    return fixture();
  }
}
