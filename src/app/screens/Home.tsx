// Domov — greeting, balance summary, and the recent-activity feed. The "+"
// opens the new-activity flow.
import { useSession, useStore } from '../data/store';
import { friendBalances, recentActivity, summarize } from '../data/derive';
import { avatarSrcProp, avatarUrlOf, firstName } from '../data/people';
import { formatEur, relativeDay } from '../format';
import { PAGE_PADDING } from '../ui/AppShell';
import { Avatar, Card, EmptyState } from '../ui/kit';
import { IconReceipt } from '../ui/icons';

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

  const me = state.people.find((p) => p.id === meId);
  const balances = friendBalances(state, meId);
  const { oweCents, waitCents } = summarize(balances);
  const recent = recentActivity(state, 6);

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

      <div style={{ font: '600 18px/1.2 Rubik', color: 'var(--text)', marginBottom: 12 }}>
        Zadnje aktivnosti
      </div>

      {recent.length === 0 ? (
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
              <Avatar name={a.payerName} id={a.payerId} size={42} {...avatarSrcProp(avatarUrlOf(state.people, a.payerId))} />
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
      )}
    </div>
  );
}
