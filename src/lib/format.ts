// The only place amounts (and phone numbers) are formatted or parsed (PLAN.md §4.4).
// sl-SI conventions: "." thousands separator, "," decimal comma, symbol after the number.

const NBSP = ' ';

// --- Currency (docs/API.md §4.4) ---
// Amounts stay integer minor units; currency only changes the displayed symbol.
// A group picks one currency (mixing currencies within a split/balance is
// meaningless without live FX), and the active one is set when its group loads.
// Only 2-decimal currencies are offered, so minor-unit math is unchanged.
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CHF: 'CHF',
  SEK: 'kr',
  DKK: 'kr',
  NOK: 'kr',
  PLN: 'zł',
  CZK: 'Kč',
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_SYMBOLS);
export const DEFAULT_CURRENCY = 'EUR';

let activeCurrency = DEFAULT_CURRENCY;

/** Sets the currency used by formatEur — called when a group becomes active. */
export function setActiveCurrency(code: string | null | undefined): void {
  activeCurrency = code && CURRENCY_SYMBOLS[code] ? code : DEFAULT_CURRENCY;
}

export function getActiveCurrency(): string {
  return activeCurrency;
}

/** Symbol for a currency code (defaults to the active currency, then the code). */
export function currencySymbol(code: string = activeCurrency): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

/** Formats integer cents as "12,15 €" / "1.234,56 €" in the active currency. */
export function formatEur(cents: number): string {
  return `${formatEurPlain(cents)}${NBSP}${currencySymbol()}`;
}

/** Formats integer cents as a plain amount: "12,15" (what NLB Pay expects typed/pasted). */
export function formatEurPlain(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error('cents must be an integer');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = String(abs % 100).padStart(2, '0');
  return `${sign}${euros},${decimals}`;
}

/**
 * Parses user input like "12,15", "12.15", "12" or "12,15 €" to integer cents.
 * String-based — no float arithmetic. Returns null on invalid input.
 */
export function parseEur(input: string): number | null {
  const cleaned = input.replace(/[\s€]/g, ''); // \s covers NBSP and narrow NBSP
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match || !match[1]) return null;
  const euros = Number(match[1]);
  if (!Number.isSafeInteger(euros * 100)) return null;
  const cents = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  return euros * 100 + cents;
}

/**
 * Normalizes a Slovenian mobile number to "0XXXXXXXX".
 * Accepts local ("031 123 456") and international ("+386 31 123 456") forms.
 * Returns null when invalid.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s\-/().]/g, '');
  const intl = /^(?:\+386|00386)([1-9]\d{7})$/.exec(compact);
  if (intl) return `0${intl[1]}`;
  if (/^0[1-9]\d{7}$/.test(compact)) return compact;
  return null;
}

/** Formats a normalized phone number for display: "031 123 456". */
export function formatPhone(phone: string): string {
  if (!/^\d{9}$/.test(phone)) return phone;
  return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
}

/** Formats an epoch-ms timestamp as a short sl-SI date, e.g. "14. 7. 2026". */
export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('sl-SI', { dateStyle: 'short' }).format(new Date(timestamp));
}
