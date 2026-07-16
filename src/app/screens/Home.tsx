// Domov — greeting, balance summary, and the recent-activity feed (list or a
// stylised map of where the money went). The "+" opens the new-activity flow.
import { useState } from 'react';
import { useSession, useStore } from '../data/store';
import { friendBalances, recentActivity, spendingByPlace, summarize } from '../data/derive';
import { firstName } from '../data/people';
import { formatEur, relativeDay } from '../format';
import { PAGE_PADDING } from '../ui/AppShell';
import { Avatar, Card, EmptyState, Segmented } from '../ui/kit';
import { IconLocate, IconReceipt } from '../ui/icons';

export function Home({
  onNewActivity,
  onOpenActivity,
}: {
  onNewActivity: () => void;
  onOpenActivity: (outingId: string) => void;
}) {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const [view, setView] = useState<'list' | 'map'>('list');

  const me = state.people.find((p) => p.id === meId);
  const balances = friendBalances(state, meId);
  const { oweCents, waitCents } = summarize(balances);
  const recent = recentActivity(state, 6);
  const topPlace = spendingByPlace(state, meId, 0)[0];

  return (
    <div style={{ padding: PAGE_PADDING }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ font: '400 15px/1.2 Rubik', color: 'var(--text-sec)' }}>Dober dan 👋</div>
          <div style={{ font: '700 26px/1.15 Rubik', color: 'var(--text)', marginTop: 3 }}>
            Živjo, {me ? firstName(me.name) : 'prijatelj'}!
          </div>
        </div>
        <button
          onClick={onNewActivity}
          aria-label="Nova aktivnost"
          style={{
            width: 46,
            height: 46,
            borderRadius: 9999,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            fontSize: 26,
            fontWeight: 300,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 6px 16px rgba(18,82,179,0.32)',
            flexShrink: 0,
          }}
        >
          +
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
        <Card tone="surface2" style={{ flex: 1 }}>
          <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 7 }}>
            Skupaj dolguješ
          </div>
          <div style={{ font: '600 20px/1 Rubik', color: 'var(--neg)' }}>{formatEur(oweCents)}</div>
        </Card>
        <Card tone="surface2" style={{ flex: 1 }}>
          <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 7 }}>
            Čakaš na
          </div>
          <div style={{ font: '600 20px/1 Rubik', color: 'var(--pend)' }}>{formatEur(waitCents)}</div>
        </Card>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ font: '600 18px/1.2 Rubik', color: 'var(--text)' }}>Zadnje aktivnosti</div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: 'Seznam' },
            { value: 'map', label: 'Zemljevid' },
          ]}
        />
      </div>

      {view === 'list' ? (
        recent.length === 0 ? (
          <EmptyState
            icon={<IconReceipt size={30} color="var(--text-sec)" />}
            title="Še ni aktivnosti"
            subtitle="Začni novo aktivnost z gumbom + zgoraj."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recent.map((a) => (
              <Card
                key={a.id}
                onClick={() => onOpenActivity(a.outingId)}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px' }}
              >
                <Avatar name={a.payerName} id={a.payerId} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      font: '600 15px/1.25 Rubik',
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {firstName(a.payerName)} · {a.description}
                  </div>
                  <div style={{ font: '400 13px/1.3 Rubik', color: 'var(--text-sec)' }}>
                    {a.outingName ? `${a.outingName} · ` : ''}plačal {relativeDay(a.createdAt)}
                  </div>
                </div>
                <div style={{ font: '600 16px/1 Rubik', color: 'var(--text)' }}>
                  {formatEur(a.amountCents)}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <MapView label={topPlace?.label ?? state.outings[0]?.name ?? 'Ljubljana'} />
      )}
    </div>
  );
}

function MapView({ label }: { label: string }) {
  return (
    <div
      style={{
        position: 'relative',
        height: 340,
        borderRadius: 20,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'linear-gradient(135deg, #E8EDF3 0%, #DDE6EE 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(#ffffff55 1px, transparent 1px), linear-gradient(90deg, #ffffff55 1px, transparent 1px)',
          backgroundSize: '34px 34px',
        }}
      />
      <div style={{ position: 'absolute', top: '30%', left: '22%', width: 60, height: 8, background: '#C7D2DE', borderRadius: 4, transform: 'rotate(28deg)' }} />
      <div style={{ position: 'absolute', top: '55%', left: '50%', width: 120, height: 9, background: '#C7D2DE', borderRadius: 4, transform: 'rotate(-14deg)' }} />
      <div style={{ position: 'absolute', top: '44%', left: '46%', transform: 'translate(-50%,-100%)' }}>
        <div
          style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            font: '600 12px/1 Rubik',
            padding: '6px 10px',
            borderRadius: 9999,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
          }}
        >
          {label} · najbolj obiskano
        </div>
        <div style={{ width: 12, height: 12, background: 'var(--accent)', transform: 'rotate(45deg)', margin: '-6px auto 0' }} />
      </div>
      <div style={{ position: 'absolute', top: '66%', left: '30%', width: 16, height: 16, borderRadius: 9999, background: 'var(--accent)', border: '3px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }} />
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          right: 14,
          width: 44,
          height: 44,
          borderRadius: 9999,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 3px 10px rgba(0,0,0,0.18)',
        }}
      >
        <IconLocate size={20} color="#1252b3" strokeWidth={2} />
      </div>
    </div>
  );
}
