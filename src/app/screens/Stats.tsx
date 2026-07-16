// Statistika — received / sent / owed / waiting, a per-place spending bar chart
// and category tiles, all scoped to a period. Numbers come from the engine via
// the derive selectors.
import { useState } from 'react';
import { useSession, useStore } from '../data/store';
import {
  categoryTotals,
  friendBalances,
  periodStart,
  spendingByPlace,
  statTotals,
  type StatsPeriod,
} from '../data/derive';
import { store } from '../data/store';
import { formatEur } from '../format';
import { useFlik } from '../ui/FlikSheet';
import { Card } from '../ui/kit';

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'week', label: 'Ta teden' },
  { value: 'month', label: 'Ta mesec' },
  { value: 'year', label: 'Leto' },
];

export function Stats() {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const flik = useFlik();
  const [period, setPeriod] = useState<StatsPeriod>('week');

  const fromMs = periodStart(period);
  const balances = friendBalances(state, meId);
  const totals = statTotals(state, meId, balances, fromMs);
  const bars = spendingByPlace(state, meId, fromMs);
  const categories = categoryTotals(state, meId, fromMs);

  const payDebt = () => {
    const debtor = [...balances].filter((b) => b.cents < 0).sort((a, b) => a.cents - b.cents)[0];
    if (!debtor) {
      store.toast('Nimaš odprtih dolgov.');
      return;
    }
    flik.open({
      toName: debtor.person.name,
      ...(debtor.person.phone ? { toPhone: debtor.person.phone } : {}),
      amountCents: -debtor.cents,
    });
  };

  return (
    <div style={{ height: '100%' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 3,
          background: 'var(--bg)',
          padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 20px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ font: '700 26px/1.15 Rubik', color: 'var(--text)' }}>Statistika</div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as StatsPeriod)}
          style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px', font: '500 14px/1 Rubik', color: 'var(--text)', background: 'var(--field)', appearance: 'none' }}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ padding: '4px 20px calc(env(safe-area-inset-bottom, 0px) + 104px)' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Card tone="surface2" style={{ flex: 1 }}>
            <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 7 }}>Prejeto</div>
            <div style={{ font: '600 22px/1 Rubik', color: 'var(--pos)' }}>{formatEur(totals.receivedCents)}</div>
          </Card>
          <Card tone="surface2" style={{ flex: 1 }}>
            <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 7 }}>Poslano</div>
            <div style={{ font: '600 22px/1 Rubik', color: 'var(--neg)' }}>{formatEur(totals.sentCents)}</div>
          </Card>
        </div>

        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ font: '400 13px/1.2 Rubik', color: 'var(--text-sec)' }}>Dolžen</div>
            <div style={{ font: '600 18px/1.1 Rubik', color: 'var(--neg)', marginTop: 3 }}>{formatEur(totals.oweCents)}</div>
          </div>
          <button onClick={payDebt} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 9999, padding: '10px 20px', font: '600 14px/1 Rubik', cursor: 'pointer' }}>
            Plačaj
          </button>
        </Card>
        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div style={{ font: '400 13px/1.2 Rubik', color: 'var(--text-sec)' }}>Čakaš</div>
            <div style={{ font: '600 18px/1.1 Rubik', color: 'var(--pend)', marginTop: 3 }}>{formatEur(totals.waitCents)}</div>
          </div>
          <button
            onClick={() => store.toast('Opomniki poslani')}
            style={{ background: 'var(--surface3)', color: 'var(--link)', border: 'none', borderRadius: 9999, padding: '10px 20px', font: '600 14px/1 Rubik', cursor: 'pointer' }}
          >
            Opomni
          </button>
        </Card>

        <div style={{ font: '600 18px/1.2 Rubik', color: 'var(--text)', marginBottom: 14 }}>Največ si zapravil v</div>
        {bars.length === 0 ? (
          <div style={{ font: '400 14px/1.5 Rubik', color: 'var(--text-sec)', marginBottom: 22 }}>
            V tem obdobju ni zabeleženih stroškov.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginBottom: 22 }}>
            {bars.map((b) => (
              <div key={b.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ font: '500 14px/1 Rubik', color: 'var(--text)' }}>{b.label}</span>
                  <span style={{ font: '600 14px/1 Rubik', color: 'var(--text)' }}>{formatEur(b.cents)}</span>
                </div>
                <div style={{ height: 10, borderRadius: 9999, background: 'var(--surface3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 9999, background: 'var(--accent)', width: `${b.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {categories.length > 0 ? (
          <>
            <div style={{ font: '600 18px/1.2 Rubik', color: 'var(--text)', marginBottom: 14 }}>Po kategorijah</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {categories.map((c) => (
                <Card key={c.name} tone="surface2" style={{ flex: 1, minWidth: 90 }}>
                  <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)' }}>{c.name}</div>
                  <div style={{ font: '600 17px/1.1 Rubik', color: 'var(--text)', marginTop: 5 }}>{formatEur(c.cents)}</div>
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
