// Simulated ads (free plan only). Banners are slotted into screens; a full-screen
// interstitial runs for 10s after an activity is settled. "Random pictures" come
// from picsum.photos with a random seed per mount. Paid plan hides all of this.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePlan } from '../data/plan';
import { openSubscription } from '../data/subscription';
import { Button } from './kit';
import { IconClose } from './icons';

const AD_COPY = [
  { brand: 'TravelGo', text: 'Zadnji trenutek: −40 % na poletne počitnice', cta: 'Rezerviraj' },
  { brand: 'FitZona', text: 'Vadba doma – prvi mesec brezplačno', cta: 'Začni' },
  { brand: 'Kuhaj+', text: 'Sveži obroki na dom, dostava zastonj', cta: 'Naroči' },
  { brand: 'TechHub', text: 'Slušalke in ure −30 % samo ta teden', cta: 'V trgovino' },
  { brand: 'NeoBank', text: 'Odpri račun v 5 minutah, brez stroškov', cta: 'Odpri' },
  { brand: 'PizzaExpres', text: '1 + 1 gratis vsak petek', cta: 'Naroči zdaj' },
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length] as T;
}

function AdTag(): ReactNode {
  return (
    <span
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        font: '700 9px/1 Rubik',
        letterSpacing: '0.5px',
        color: '#fff',
        background: 'rgba(0,0,0,0.55)',
        borderRadius: 5,
        padding: '3px 5px',
        textTransform: 'uppercase',
      }}
    >
      Oglas
    </span>
  );
}

/** Small in-feed sponsored banner. Renders nothing on the paid plan. */
export function AdBanner({ style }: { style?: React.CSSProperties }) {
  const plan = usePlan();
  const [seed] = useState(() => Math.floor(Math.random() * 100000));
  if (plan === 'paid') return null;
  const ad = pick(AD_COPY, seed);
  const img = `https://picsum.photos/seed/splitflik-ad-${seed}/240/240`;
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: 10,
        overflow: 'hidden',
        ...style,
      }}
    >
      <AdTag />
      <img
        src={img}
        alt=""
        width={72}
        height={72}
        loading="lazy"
        style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0, background: 'var(--surface3)' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '700 13px/1.2 Rubik', color: 'var(--text)' }}>{ad.brand}</div>
        <div style={{ font: '400 12px/1.35 Rubik', color: 'var(--text-sec)', marginTop: 2 }}>{ad.text}</div>
        <button
          onClick={() => openSubscription()}
          style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, font: '600 11px/1 Rubik', color: 'var(--link)', cursor: 'pointer' }}
        >
          Odstrani oglase →
        </button>
      </div>
      <div
        style={{ font: '600 12px/1 Rubik', color: 'var(--on-accent)', background: 'var(--accent)', borderRadius: 9999, padding: '7px 12px', flexShrink: 0 }}
      >
        {ad.cta}
      </div>
    </div>
  );
}

/** Full-screen 10-second interstitial shown after finishing an activity. */
export function AdInterstitial({ onClose }: { onClose: () => void }) {
  const [left, setLeft] = useState(10);
  const [seed] = useState(() => Math.floor(Math.random() * 100000));

  useEffect(() => {
    const id = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          clearInterval(id);
          onClose();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ad = pick(AD_COPY, seed);
  const img = `https://picsum.photos/seed/splitflik-full-${seed}/800/1200`;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        animation: 'splitflik-fade 0.2s ease',
      }}
    >
      <img
        src={img}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.85) 100%)' }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top, 0px) + 18px) 18px 0' }}>
        <span style={{ font: '700 10px/1 Rubik', letterSpacing: '0.6px', color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '5px 8px', textTransform: 'uppercase' }}>
          Oglas
        </span>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 12px/1 Rubik', color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 9999, padding: '7px 12px' }}
        >
          <IconClose size={13} color="rgba(255,255,255,0.6)" strokeWidth={2.4} />
          {left}s
        </span>
      </div>

      <div style={{ position: 'relative', marginTop: 'auto', padding: 'calc(env(safe-area-inset-bottom, 0px) + 26px) 22px 30px', textAlign: 'center' }}>
        <div style={{ font: '800 30px/1.1 Rubik', color: '#fff', marginBottom: 8 }}>{ad.brand}</div>
        <div style={{ font: '400 16px/1.4 Rubik', color: 'rgba(255,255,255,0.9)', marginBottom: 20 }}>{ad.text}</div>
        <Button variant="primary" full onClick={() => window.open('https://example.com', '_blank', 'noopener')}>
          {ad.cta}
        </Button>
        <button
          onClick={() => {
            onClose();
            openSubscription();
          }}
          style={{ marginTop: 16, background: 'none', border: 'none', font: '600 13px/1 Rubik', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}
        >
          Nadgradi na Plus in odstrani oglase
        </button>
      </div>
    </div>,
    document.body,
  );
}
