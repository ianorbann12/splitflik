// Vercel serverless function (PLAN.md §7): receipt image → Anthropic vision →
// strict JSON items. ANTHROPIC_API_KEY lives only here (CLAUDE.md rule 6); the
// image is parsed and discarded — never persisted, never logged.
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sanitizeResult, validateRequest } from './_validate';

// Vision model id. Defaults to Claude; override with RECEIPT_MODEL to route
// through a proxy (e.g. LiteLLM + ANTHROPIC_BASE_URL) to another provider.
const MODEL = process.env['RECEIPT_MODEL'] ?? 'claude-sonnet-5';

const RECEIPT_TOOL: Anthropic.Tool = {
  name: 'report_receipt',
  description: 'Report the line items parsed from a store or restaurant receipt.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'One entry per purchasable line item on the receipt.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Item name as printed, cleaned up.' },
            quantity: { type: 'integer', minimum: 1 },
            totalCents: {
              type: 'integer',
              minimum: 1,
              description: 'Final line total in euro cents (integer). 12,50 € → 1250.',
            },
          },
          required: ['label', 'quantity', 'totalCents'],
        },
      },
      totalCents: {
        type: ['integer', 'null'],
        description: 'Receipt grand total in euro cents, or null if unreadable.',
      },
    },
    required: ['items', 'totalCents'],
  },
};

const PROMPT =
  'Read this receipt image (likely Slovenian, amounts in EUR). Extract every ' +
  'purchasable line item with its final line total in euro cents as an integer ' +
  '(e.g. "2x Pivo 3,20 6,40" → quantity 2, totalCents 640). Skip taxes, change, ' +
  'card details and subtotals. Also report the grand total in cents when visible. ' +
  'If the image is not a readable receipt, report an empty items array.';

async function parseWithModel(
  client: Anthropic,
  image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<unknown> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [RECEIPT_TOOL],
    tool_choice: { type: 'tool', name: 'report_receipt' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });
  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  return block?.input ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    res.status(500).json({ error: 'not_configured' });
    return;
  }

  const request = validateRequest(req.body);
  if (request === 'too_large') {
    res.status(413).json({ error: 'image_too_large' });
    return;
  }
  if (request === null) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 });
  let raw: unknown;
  try {
    raw = await parseWithModel(client, request.image, request.mediaType);
  } catch {
    // No details leak to the client; nothing (key, image) is logged.
    res.status(502).json({ error: 'parse_unavailable' });
    return;
  }

  const result = sanitizeResult(raw);
  if (!result || result.items.length === 0) {
    res.status(422).json({ error: 'not_a_receipt' });
    return;
  }
  res.status(200).json(result);
}
