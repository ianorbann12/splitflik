// UI formatting — thin layer over the backend's sl-SI formatters (the only
// place money/phones are formatted) plus a couple of display-only helpers.
export {
  formatEur,
  formatEurPlain,
  parseEur,
  normalizePhone,
  formatPhone,
  formatDate,
  setActiveCurrency,
  getActiveCurrency,
  currencySymbol,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
} from '../lib/format';

import { formatEur, formatDate } from '../lib/format';

/** "+12,15 €" / "−6,00 €" / "0,00 €" — uses a real minus sign. */
export function signedEur(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return sign + formatEur(Math.abs(cents));
}

/** Short Slovenian relative day: danes / včeraj / pred N dnevi / a date. */
export function relativeDay(timestamp: number, now: number = Date.now()): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / 86_400_000);
  if (days <= 0) return 'danes';
  if (days === 1) return 'včeraj';
  if (days === 2) return 'predvčerajšnjim';
  if (days < 7) return `pred ${days} dnevi`;
  return formatDate(timestamp);
}
