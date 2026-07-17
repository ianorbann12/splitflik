// SplitFlik Plus — a SIMULATED subscription (CLAUDE.md rule 4 is overridden here
// by explicit product request). The card form is a DEMO: it offers a fake test
// card, warns against real details, and never stores or transmits anything —
// "subscribing" just flips a local flag. No real payment processing exists.
import { useState } from 'react';
import {
  FREE_MAX_MEMBERS,
  FREE_WEEKLY_RECEIPTS,
  PAID_WEEKLY_RECEIPTS,
  setPlan,
  usePlan,
} from '../data/plan';
import { closeSubscription } from '../data/subscription';
import { store } from '../data/store';
import { BottomSheet, Button, FieldLabel, Select, TextField } from '../ui/kit';
import { IconCheck } from '../ui/icons';

const PRICE = '2,99 €';

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const YEARS = Array.from({ length: 12 }, (_, i) => String(((new Date().getFullYear() % 100) + i) % 100).padStart(2, '0'));

/** Keep only digits, cap at 16, group into blocks of 4 ("4242 4242 …"). */
function formatCard(v: string): string {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function Row({ ok, children }: { ok: boolean; children: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 9999,
          background: ok ? 'var(--accent-soft)' : 'var(--surface3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {ok ? <IconCheck size={12} color="var(--pos)" strokeWidth={3} /> : <span style={{ font: '600 12px/1 Rubik', color: 'var(--text-sec)' }}>·</span>}
      </span>
      <span style={{ font: '400 13px/1.35 Rubik', color: ok ? 'var(--text)' : 'var(--text-sec)' }}>{children}</span>
    </div>
  );
}

export function SubscriptionSheet() {
  const plan = usePlan();
  const [card, setCard] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [holder, setHolder] = useState('');

  const useDemoCard = () => {
    setCard('4242 4242 4242 4242');
    setExpMonth('12');
    setExpYear('34');
    setCvv('123');
    setHolder('DEMO UPORABNIK');
  };

  const subscribe = () => {
    const digits = card.replace(/\D/g, '');
    if (digits.length !== 16 || !expMonth || !expYear || cvv.length !== 3 || !holder.trim()) {
      store.toast('Izpolni podatke kartice (ali uporabi predstavitveno).');
      return;
    }
    // Demo only — nothing is stored or sent anywhere; just flip the local plan.
    setPlan('paid');
    store.toast('Dobrodošel v SplitFlik Plus 🎉');
    closeSubscription();
  };

  if (plan === 'paid') {
    return (
      <BottomSheet title="SplitFlik Plus" onClose={closeSubscription}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-soft)', borderRadius: 14, padding: '12px 14px', marginBottom: 16 }}>
          <IconCheck size={20} color="var(--pos)" strokeWidth={2.6} />
          <div style={{ font: '600 15px/1.3 Rubik', color: 'var(--text)' }}>Plus je aktiven — hvala!</div>
        </div>
        <Row ok>{`${PAID_WEEKLY_RECEIPTS} računov na teden za razčlembo`}</Row>
        <Row ok>Neomejeno oseb v skupini in aktivnosti</Row>
        <Row ok>Brez oglasov</Row>
        <button
          onClick={() => {
            setPlan('free');
            store.toast('Naročnina preklicana');
            closeSubscription();
          }}
          style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-sec)', font: '600 13px/1 Rubik', cursor: 'pointer', marginTop: 18, padding: 8 }}
        >
          Prekliči naročnino
        </button>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title="SplitFlik Plus" onClose={closeSubscription}>
      <div style={{ font: '400 13px/1.5 Rubik', color: 'var(--text-sec)', marginBottom: 16 }}>
        Nadgradi za {PRICE}/mesec in odkleni polno izkušnjo.
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 16, padding: '14px 13px' }}>
          <div style={{ font: '700 14px/1 Rubik', color: 'var(--text)', marginBottom: 12 }}>Brezplačno</div>
          <Row ok={false}>{`${FREE_WEEKLY_RECEIPTS} računa na teden`}</Row>
          <Row ok={false}>{`Do ${FREE_MAX_MEMBERS} oseb`}</Row>
          <Row ok={false}>Z oglasi</Row>
        </div>
        <div style={{ flex: 1, border: '1px solid var(--accent)', background: 'var(--accent-soft)', borderRadius: 16, padding: '14px 13px' }}>
          <div style={{ font: '700 14px/1 Rubik', color: 'var(--text)', marginBottom: 12 }}>Plus</div>
          <Row ok>{`${PAID_WEEKLY_RECEIPTS} računov / teden`}</Row>
          <Row ok>Neomejeno oseb</Row>
          <Row ok>Brez oglasov</Row>
        </div>
      </div>

      <div style={{ font: '400 11.5px/1.5 Rubik', color: 'var(--pend)', background: 'rgba(224,158,0,0.12)', borderRadius: 12, padding: '10px 12px', marginBottom: 16 }}>
        ⚠️ Predstavitveni način — <b>ne vnašaj pravih podatkov kartice</b>. Nič se ne shrani in
        nič se ne pošlje; naročnina je samo simulirana.
      </div>

      <FieldLabel>Ime na kartici</FieldLabel>
      <TextField value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Ime Priimek" autoComplete="off" style={{ marginBottom: 12 }} />
      <FieldLabel>Številka kartice</FieldLabel>
      <TextField
        value={card}
        onChange={(e) => setCard(formatCard(e.target.value))}
        inputMode="numeric"
        maxLength={19}
        placeholder="4242 4242 4242 4242"
        autoComplete="off"
        style={{ marginBottom: 12 }}
      />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FieldLabel>Poteče</FieldLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <Select value={expMonth} onChange={(e) => setExpMonth(e.target.value)}>
              <option value="" disabled>
                MM
              </option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Select value={expYear} onChange={(e) => setExpYear(e.target.value)}>
              <option value="" disabled>
                LL
              </option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FieldLabel>CVV</FieldLabel>
          <TextField
            type="password"
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            maxLength={3}
            placeholder="123"
            autoComplete="off"
          />
        </div>
      </div>

      <Button variant="secondary" full onClick={useDemoCard} style={{ marginBottom: 10 }}>
        Uporabi predstavitveno kartico
      </Button>
      <Button variant="primary" full onClick={subscribe}>
        Naroči se — {PRICE}/mesec
      </Button>
    </BottomSheet>
  );
}
