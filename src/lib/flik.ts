// NLB Pay / Flik handoff (PLAN.md §6, CLAUDE.md rule 3).
//
// There is no public NLB/Flik consumer API and no documented deep link.
// SplitFlik never sends payments, polls payment status, or calls any NLB
// endpoint. The full extent of the integration: copy the amount to the
// clipboard, show the payee's phone number, and link to the NLB Pay store page.
import { formatEurPlain } from './format';

/** Must stay visible on the handoff sheet at all times (PLAN.md §6). */
export const FLIK_DISCLAIMER =
  'SplitFlik ni povezan z NLB d.d. ali sistemom Flik in ne pošilja plačil. ' +
  'Plačilo izvedete sami v aplikaciji NLB Pay. Pred potrditvijo v aplikaciji ' +
  'preverite znesek in prejemnika.';

export const NLB_PAY_PLAY_URL =
  'https://play.google.com/store/apps/details?id=si.nlbpay.slovenija';
export const NLB_PAY_APP_STORE_URL = 'https://apps.apple.com/si/app/nlb-pay/id1509897528';

export type Platform = 'android' | 'ios' | 'unknown';

export function detectPlatform(userAgent: string = navigator.userAgent): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'unknown';
}

/** Copies the plain amount ("12,15") to the clipboard. Resolves false on failure. */
export async function copyAmount(cents: number): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(formatEurPlain(cents));
    return true;
  } catch {
    return false;
  }
}

/** Copies arbitrary text (recipient phone, payment reason) to the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
