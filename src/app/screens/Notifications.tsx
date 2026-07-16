// Obvestila — payment requests, incoming payments and settlement notices,
// grouped by recency. Actionable cards carry a Flik "Plačaj" or an "Opomni"
// reminder. Derived entirely from the group's settlements.
import { useEffect } from 'react';
import { useSession, useStore } from '../data/store';
import { notifications, type Notif } from '../data/derive';
import { acceptRequest, declineRequest, loadRequests, useIncomingRequests } from '../data/friendRequests';
import { getLocalProfile } from '../data/profile';
import { markNotificationsRead, useNotifReadAt } from '../data/uiPrefs';
import { avatarSrcProp, avatarUrlOf, firstName } from '../data/people';
import { store } from '../data/store';
import { formatEur, formatPhone } from '../format';
import { useFlik } from '../ui/FlikSheet';
import { PAGE_PADDING } from '../ui/AppShell';
import { Avatar, Button, EmptyState } from '../ui/kit';
import { IconBell } from '../ui/icons';

export function Notifications() {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const userId = typeof state.authUserId === 'string' ? state.authUserId : '';
  const readAt = useNotifReadAt();
  const flik = useFlik();
  const { groups } = notifications(state, meId, readAt);
  const incoming = useIncomingRequests();

  const profile = getLocalProfile();
  const meP = state.people.find((p) => p.id === meId);
  const myPhone = profile?.phone ?? meP?.phone ?? '';
  const meName = profile?.name ?? meP?.name;
  const meAvatar = profile?.avatarUrl ?? meP?.avatarUrl;
  const me = {
    userId,
    ...(meName ? { name: meName } : {}),
    ...(myPhone ? { phone: myPhone } : {}),
    ...(meAvatar ? { avatarUrl: meAvatar } : {}),
  };

  useEffect(() => {
    if (userId) void loadRequests(userId, myPhone);
  }, [userId, myPhone]);

  const phoneOf = (id: string) => state.people.find((p) => p.id === id)?.phone;

  const label = (n: Notif): string => {
    const who = firstName(n.otherName);
    switch (n.kind) {
      case 'owe':
        return `Poravnaj dolg do ${who}`;
      case 'awaiting':
        return `Čakaš na plačilo od ${who}`;
      case 'received':
        return `${who} ti je plačal`;
      case 'sent':
        return `Plačal si ${who}`;
    }
  };

  const amountColor = (n: Notif): string => {
    switch (n.kind) {
      case 'owe':
        return 'var(--neg)';
      case 'awaiting':
        return 'var(--pend)';
      default:
        return 'var(--pos)';
    }
  };

  const amountText = (n: Notif): string =>
    (n.kind === 'received' ? '+' : '') + formatEur(n.amountCents);

  return (
    <div style={{ padding: PAGE_PADDING }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ font: '700 26px/1.15 Rubik', color: 'var(--text)' }}>Obvestila</div>
        <button
          onClick={() => {
            markNotificationsRead(Date.now());
            store.toast('Vsa obvestila označena kot prebrana');
          }}
          style={{ background: 'none', border: 'none', color: 'var(--link)', font: '500 14px/1 Rubik', cursor: 'pointer' }}
        >
          Označi vse
        </button>
      </div>

      {incoming.length > 0 ? (
        <div style={{ marginBottom: 22 }}>
          <div style={{ font: '600 13px/1 Rubik', color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 11 }}>
            Prošnje za prijateljstvo
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {incoming.map((r) => (
              <div
                key={r.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, padding: '12px 14px' }}
              >
                <Avatar name={r.fromName ?? r.fromPhone ?? '?'} id={r.fromOwner} size={40} {...avatarSrcProp(r.fromAvatarUrl)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '400 14px/1.35 Rubik', color: 'var(--text)' }}>
                    <b>{r.fromName ?? formatPhone(r.fromPhone ?? '')}</b> te želi dodati med prijatelje
                  </div>
                  {r.fromPhone && r.fromName ? (
                    <div style={{ font: '400 12px/1.3 Rubik', color: 'var(--text-sec)', marginTop: 2 }}>{formatPhone(r.fromPhone)}</div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => void declineRequest(r.id)}
                    style={{ border: '1px solid var(--border)', borderRadius: 9999, padding: '9px 14px', font: '600 13px/1 Rubik', background: 'transparent', color: 'var(--text-sec)', cursor: 'pointer' }}
                  >
                    Zavrni
                  </button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      void acceptRequest(r, me);
                      store.toast(r.fromName ? `Zdaj sta prijatelja · ${firstName(r.fromName)}` : 'Prijateljstvo sprejeto');
                    }}
                  >
                    Sprejmi
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {groups.length === 0 && incoming.length === 0 ? (
        <EmptyState
          icon={<IconBell size={30} color="var(--text-sec)" />}
          title="Ni obvestil"
          subtitle="Zahtevki in plačila se bodo pojavili tukaj."
        />
      ) : (
        groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 22 }}>
            <div style={{ font: '600 13px/1 Rubik', color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 11 }}>
              {g.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.items.map((n) => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: n.unread ? 'var(--surface2)' : 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 20,
                    padding: '12px 14px',
                  }}
                >
                  <Avatar name={n.otherName} id={n.otherId} size={40} {...avatarSrcProp(avatarUrlOf(state.people, n.otherId))} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '400 14px/1.3 Rubik', color: 'var(--text)' }}>{label(n)}</div>
                    <div style={{ font: '600 14px/1.3 Rubik', color: amountColor(n), marginTop: 2 }}>
                      {amountText(n)}
                    </div>
                  </div>
                  {n.kind === 'owe' ? (
                    <Button
                      variant="pay"
                      onClick={() =>
                        flik.open({
                          toName: n.otherName,
                          ...(phoneOf(n.otherId) ? { toPhone: phoneOf(n.otherId) as string } : {}),
                          amountCents: n.amountCents,
                          settlementId: n.settlement.id,
                        })
                      }
                    >
                      Plačaj
                    </Button>
                  ) : n.kind === 'awaiting' ? (
                    <button
                      onClick={() => store.toast(`Opomnik poslan · ${firstName(n.otherName)}`)}
                      style={{ border: '1px solid var(--border)', borderRadius: 9999, padding: '9px 16px', font: '600 13px/1 Rubik', background: 'transparent', color: 'var(--link)', cursor: 'pointer', flexShrink: 0 }}
                    >
                      Opomni
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
