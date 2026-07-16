// Flik / NLB Pay handoff (backend rule 4, docs/API.md §3.4): Deli NEVER sends a
// payment or calls any NLB endpoint. This sheet only shows the payee + amount,
// copies the plain amount to the clipboard, links to the NLB Pay store page,
// and keeps the Slovenian disclaimer visible. The user pays in NLB Pay itself
// and taps "mark as paid" here afterwards.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  copyAmount,
  detectPlatform,
  FLIK_DISCLAIMER,
  NLB_PAY_APP_STORE_URL,
  NLB_PAY_PLAY_URL,
} from '../../lib/flik';
import { formatEur, formatPhone } from '../format';
import { store } from '../data/store';
import { Avatar, Button } from './kit';
import { IconClose, IconCopy } from './icons';

export interface FlikTarget {
  toName: string;
  toPhone?: string;
  amountCents: number;
  /** When present, the sheet offers "mark as paid" → markSettlementPaid. */
  settlementId?: string;
}

interface FlikContextValue {
  open: (target: FlikTarget) => void;
}

const FlikContext = createContext<FlikContextValue>({ open: () => {} });

export function useFlik(): FlikContextValue {
  return useContext(FlikContext);
}

function storeUrl(): string {
  return detectPlatform() === 'ios' ? NLB_PAY_APP_STORE_URL : NLB_PAY_PLAY_URL;
}

export function FlikProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<FlikTarget | null>(null);
  const open = useCallback((next: FlikTarget) => setTarget(next), []);
  const close = useCallback(() => setTarget(null), []);

  return (
    <FlikContext.Provider value={{ open }}>
      {children}
      {target ? <FlikSheet target={target} onClose={close} /> : null}
    </FlikContext.Provider>
  );
}

function FlikSheet({ target, onClose }: { target: FlikTarget; onClose: () => void }) {
  const onCopy = async () => {
    const ok = await copyAmount(target.amountCents);
    store.toast(ok ? 'Znesek kopiran v odložišče' : 'Kopiranje ni uspelo');
  };

  const onMarkPaid = () => {
    if (target.settlementId) {
      store.markSettlementPaid(target.settlementId);
      store.toast(`Označeno kot plačano · ${target.toName}`);
    }
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'var(--scrim)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        animation: 'deli-fade 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="deli-scroll"
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: '92%',
          overflowY: 'auto',
          background: 'var(--bg)',
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          borderTop: '1px solid var(--border-soft)',
          padding: '10px 20px calc(env(safe-area-inset-bottom, 0px) + 24px)',
          animation: 'deli-slideup 0.28s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 9999,
            background: 'var(--border)',
            margin: '4px auto 14px',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ font: '700 20px/1.2 Rubik', color: 'var(--text)' }}>Plačilo prek Flik</div>
          <button
            onClick={onClose}
            aria-label="Zapri"
            style={{
              width: 34,
              height: 34,
              borderRadius: 9999,
              border: 'none',
              background: 'var(--surface3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <IconClose size={17} color="var(--text)" strokeWidth={2.2} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '14px 16px',
            marginBottom: 14,
          }}
        >
          <Avatar name={target.toName} size={46} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 3 }}>
              Prejemnik
            </div>
            <div style={{ font: '600 16px/1.2 Rubik', color: 'var(--text)' }}>{target.toName}</div>
            {target.toPhone ? (
              <div style={{ font: '400 13px/1.3 Rubik', color: 'var(--text-sec)', marginTop: 2 }}>
                {formatPhone(target.toPhone)}
              </div>
            ) : (
              <div style={{ font: '400 13px/1.3 Rubik', color: 'var(--text-sec)', marginTop: 2 }}>
                Telefon ni na voljo
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '16px',
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 5 }}>
              Znesek
            </div>
            <div style={{ font: '700 26px/1 Rubik', color: 'var(--text)' }}>
              {formatEur(target.amountCents)}
            </div>
          </div>
          <Button variant="secondary" onClick={onCopy}>
            <IconCopy size={16} color="var(--link)" strokeWidth={2} />
            Kopiraj
          </Button>
        </div>

        <a
          href={storeUrl()}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}
        >
          <Button variant="primary" full>
            Odpri NLB Pay
          </Button>
        </a>

        {target.settlementId ? (
          <Button variant="secondary" full onClick={onMarkPaid} style={{ marginBottom: 14 }}>
            Označi kot plačano
          </Button>
        ) : null}

        <p
          style={{
            font: '400 11.5px/1.55 Rubik',
            color: 'var(--text-sec)',
            margin: 0,
            padding: '12px 14px',
            background: 'var(--surface3)',
            borderRadius: 14,
          }}
        >
          {FLIK_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
