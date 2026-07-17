// Domov — greeting, active-group switcher, balance summary, recent-activity feed.
// The active group is optional: with none, we prompt to create or join one.
import { useSession, useStore } from '../data/store';
import { friendBalances, outingExpenses, outingGrandTotal, summarize } from '../data/derive';
import { avatarSrcProp, firstName } from '../data/people';
import { getLocalProfile } from '../data/profile';
import { formatEur } from '../format';
import { PAGE_PADDING } from '../ui/AppShell';
import { Avatar, Button, Card, EmptyState } from '../ui/kit';
import { AdBanner } from '../ui/Ads';
import { IconChevronRight, IconReceipt, IconUsers } from '../ui/icons';

function Header({
  name,
  id,
  avatarUrl,
  onNewActivity,
}: {
  name: string;
  id: string;
  avatarUrl?: string;
  onNewActivity?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <Avatar name={name} id={id} size={46} {...avatarSrcProp(avatarUrl)} />
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '400 14px/1.2 Rubik', color: 'var(--text-sec)' }}>Dober dan 👋</div>
          <div style={{ font: '700 23px/1.15 Rubik', color: 'var(--text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Živjo, {name}!
          </div>
        </div>
      </div>
      {onNewActivity ? (
        <button
          onClick={onNewActivity}
          aria-label="Nova aktivnost"
          style={{ width: 46, height: 46, borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 26, fontWeight: 300, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(18,82,179,0.32)', flexShrink: 0 }}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

function GroupChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface3)', border: 'none', borderRadius: 9999, padding: '8px 8px 8px 14px', cursor: 'pointer', marginBottom: 18, maxWidth: '100%' }}
    >
      <IconUsers size={16} color="var(--text-sec)" strokeWidth={2} />
      <span style={{ font: '600 14px/1 Rubik', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <IconChevronRight size={16} color="var(--text-sec)" strokeWidth={2} />
    </button>
  );
}

export function Home({
  onNewActivity,
  onOpenActivity,
  onOpenGroups,
}: {
  onNewActivity: () => void;
  onOpenActivity: (outingId: string) => void;
  onOpenGroups: () => void;
}) {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const profile = getLocalProfile();

  const group = state.group;
  const me = state.people.find((p) => p.id === meId);
  const greetName = me ? firstName(me.name) : profile?.name ? firstName(profile.name) : 'prijatelj';
  const meAvatar = me?.avatarUrl ?? profile?.avatarUrl;
  const headerId = meId || 'me';

  if (!group) {
    return (
      <div style={{ padding: PAGE_PADDING }}>
        <Header name={greetName} id={headerId} {...(meAvatar ? { avatarUrl: meAvatar } : {})} />
        <div style={{ marginTop: 40 }}>
          <EmptyState
            icon={<IconUsers size={30} color="var(--text-sec)" />}
            title="Nimaš aktivne skupine"
            subtitle="Ustvari novo skupino s prijatelji ali se pridruži obstoječi — kadarkoli."
          />
          <Button variant="primary" full onClick={onOpenGroups} style={{ marginTop: 8 }}>
            Skupine
          </Button>
        </div>
      </div>
    );
  }

  const balances = friendBalances(state, meId);
  const { oweCents, waitCents } = summarize(balances);
  const outings = [...state.outings].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div style={{ padding: PAGE_PADDING }}>
      <Header name={greetName} id={headerId} onNewActivity={onNewActivity} {...(meAvatar ? { avatarUrl: meAvatar } : {})} />
      <GroupChip label={group.name} onClick={onOpenGroups} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
        <Card tone="surface2" style={{ flex: 1 }}>
          <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 7 }}>Skupaj dolguješ</div>
          <div style={{ font: '600 20px/1 Rubik', color: 'var(--neg)' }}>{formatEur(oweCents)}</div>
        </Card>
        <Card tone="surface2" style={{ flex: 1 }}>
          <div style={{ font: '400 12px/1.2 Rubik', color: 'var(--text-sec)', marginBottom: 7 }}>Čakaš na</div>
          <div style={{ font: '600 20px/1 Rubik', color: 'var(--pend)' }}>{formatEur(waitCents)}</div>
        </Card>
      </div>

      <AdBanner style={{ marginBottom: 22 }} />

      <div style={{ font: '600 18px/1.2 Rubik', color: 'var(--text)', marginBottom: 12 }}>Aktivnosti</div>

      {outings.length === 0 ? (
        <EmptyState
          icon={<IconReceipt size={30} color="var(--text-sec)" />}
          title="Še ni aktivnosti"
          subtitle="Začni novo aktivnost z gumbom + zgoraj."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {outings.map((o) => {
            const bills = outingExpenses(state, o.id, o.currentCycle);
            const total = outingGrandTotal(bills);
            const pc = o.participantIds.length;
            return (
              <Card key={o.id} onClick={() => onOpenActivity(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px' }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IconReceipt size={20} color="var(--accent)" strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 15px/1.25 Rubik', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.name}
                  </div>
                  <div style={{ font: '400 13px/1.3 Rubik', color: 'var(--text-sec)' }}>
                    {pc} {pc === 1 ? 'udeleženec' : 'udeležencev'} ·{' '}
                    {bills.length === 0 ? 'brez računov' : `${bills.length} ${bills.length === 1 ? 'račun' : 'računov'}`}
                  </div>
                </div>
                <div style={{ font: '600 16px/1 Rubik', color: 'var(--text)' }}>{formatEur(total)}</div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
