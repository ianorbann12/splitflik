// NLB Pay / Flik handoff (PLAN.md §6, CLAUDE.md rule 4).
//
// There is no public NLB/Flik consumer API and no documented deep link that
// pre-fills a payment. SplitFlik never sends payments, polls status, or calls
// any NLB/Flik endpoint. The integration: copy the recipient number, amount and
// reason, then open the user's payment app — NLB Pay OR the standalone Flik Pay
// app. On Android we open the installed app directly (Chrome intent + package,
// with a store fallback); iOS exposes no public scheme, so it opens the store
// page (which offers "Open" when the app is already installed).
import { formatEurPlain } from './format';

/** Must stay visible on the handoff sheet at all times (PLAN.md §6). */
export const FLIK_DISCLAIMER =
  'SplitFlik ni povezan z NLB d.d. ali sistemom Flik in ne pošilja plačil. ' +
  'Plačilo izvedeš sam v svoji aplikaciji (NLB Pay ali Flik). Pred potrditvijo ' +
  'v aplikaciji preveri znesek in prejemnika.';

export const NLB_PAY_PLAY_URL =
  'https://play.google.com/store/apps/details?id=si.nlbpay.slovenija';
export const NLB_PAY_APP_STORE_URL = 'https://apps.apple.com/si/app/nlb-pay/id1509897528';
export const FLIK_PAY_PLAY_URL = 'https://play.google.com/store/apps/details?id=si.bankart.flik';
export const FLIK_PAY_APP_STORE_URL = 'https://apps.apple.com/si/app/flik-pay/id1467334271';

export type Platform = 'android' | 'ios' | 'unknown';

export function detectPlatform(userAgent: string = navigator.userAgent): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'unknown';
}

export interface PayApp {
  key: 'nlbpay' | 'flik';
  label: string;
  /** Android package id — lets us open the installed app directly. */
  androidPkg: string;
  iosStore: string;
  androidStore: string;
}

/** The payment apps SplitFlik can hand off to (user picks whichever they have). */
export const PAY_APPS: PayApp[] = [
  {
    key: 'nlbpay',
    label: 'NLB Pay',
    androidPkg: 'si.nlbpay.slovenija',
    iosStore: NLB_PAY_APP_STORE_URL,
    androidStore: NLB_PAY_PLAY_URL,
  },
  {
    key: 'flik',
    label: 'Flik Pay',
    androidPkg: 'si.bankart.flik',
    iosStore: FLIK_PAY_APP_STORE_URL,
    androidStore: FLIK_PAY_PLAY_URL,
  },
];

/**
 * Opens the user's payment app. Android launches the installed app by package
 * (Chrome intent) with a Play Store fallback; iOS/desktop open the store page —
 * no public URL scheme exists to launch these apps, and iOS shows "Open" when
 * the app is already installed. Handoff only — never sends a payment.
 */
export function openPaymentApp(app: PayApp): void {
  const platform = detectPlatform();
  if (platform === 'android') {
    const fallback = encodeURIComponent(app.androidStore);
    window.location.href = `intent://#Intent;package=${app.androidPkg};S.browser_fallback_url=${fallback};end`;
    return;
  }
  window.open(platform === 'ios' ? app.iosStore : app.androidStore, '_blank', 'noopener');
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
