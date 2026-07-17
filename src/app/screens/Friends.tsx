// Prijatelji — your user-level friend roster (independent of any group). Add a
// friend by phone number, in-app (no SMS): if they're registered, their profile
// picture + name come back automatically. A friend's phone can never be changed
// (feature 2); you rename or remove them. For friends who are in the currently
// active group, their balance + Flik "Plačaj" is shown too.
import { useEffect, useState } from 'react';
import type { Friend } from '../../types';
import { friendBalances } from '../data/derive';
import { loadFriends, removeFriend, useFriends } from '../data/friends';
import { loadRequests, sendRequest, useOutgoingRequests } from '../data/friendRequests';
import { getLocalProfile } from '../data/profile';
import { avatarSrcProp } from '../data/people';
import { store, useSession, useStore } from '../data/store';
import { formatPhone, normalizePhone, signedEur } from '../format';
import { useFlik } from '../ui/FlikSheet';
import { PAGE_PADDING } from '../ui/AppShell';
import { Avatar, BottomSheet, Button, Card, ConfirmDialog, FieldLabel, TextField } from '../ui/kit';
import { AdBanner } from '../ui/Ads';
import { IconClock, IconLink, IconSearch } from '../ui/icons';

type Sender = { userId: string; name?: string; phone?: string; avatarUrl?: string };
type SheetState = { mode: 'add' } | { mode: 'edit'; friend: Friend } | null;

export function Friends() {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const userId = typeof state.authUserId === 'string' ? state.authUserId : '';
  const flik = useFlik();
  const friends = useFriends();
  const outgoing = useOutgoingRequests();
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<SheetState>(null);

  const profile = getLocalProfile();
  const meP = state.people.find((p) => p.id === meId);
  const myPhone = profile?.phone ?? meP?.phone ?? '';
  const senderName = profile?.name ?? meP?.name;
  const senderAvatar = profile?.avatarUrl ?? meP?.avatarUrl;
  const sender: Sender = {
    userId,
    ...(senderName ? { name: senderName } : {}),
    ...(myPhone ? { phone: myPhone } : {}),
    ...(senderAvatar ? { avatarUrl: senderAvatar } : {}),
  };

  useEffect(() => {
    if (userId) {
      void loadFriends(userId);
      void loadRequests(userId, myPhone);
    }
  }, [userId, myPhone]);

  // Sent requests still waiting for the other person (not already friends).
  const pendingOut = outgoing.filter((r) => !friends.some((f) => f.phone === r.toPhone));

  // Balances for friends who are members of the currently active group.
  const balByPhone = new Map<string, number>();
  for (const b of friendBalances(state, meId)) {
    if (b.person.phone) balByPhone.set(b.person.phone, b.cents);
  }

  const q = query.trim().toLowerCase();
  const list = [...friends]
    .filter((f) => !q || (f.name ?? f.phone).toLowerCase().includes(q) || f.phone.includes(q))
    .sort((a, b) => (a.name ?? a.phone).localeCompare(b.name ?? b.phone, 'sl'));

  return (
    <div style={{ padding: PAGE_PADDING }}>
      <div style={{ font: '700 26px/1.15 Rubik', color: 'var(--text)', marginBottom: 16 }}>Prijatelji</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface3)', borderRadius: 12, padding: '10px 13px', marginBottom: 14 }}>
        <IconSearch size={17} color="var(--text-sec)" strokeWidth={2.2} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Išči prijatelja"
          style={{ flex: 1, border: 'none', background: 'transparent', font: '400 15px/1 Rubik', color: 'var(--text)' }}
        />
      </div>

      <AdBanner style={{ marginBottom: 14 }} />

      {list.length === 0 ? (
        <div style={{ font: '400 14px/1.5 Rubik', color: 'var(--text-sec)', padding: '24px 4px' }}>
          {friends.length === 0 ? 'Nimaš še prijateljev. Dodaj jih s telefonsko številko.' : 'Ni zadetkov.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((f) => {
            const bal = balByPhone.get(f.phone);
            const title = f.name ?? formatPhone(f.phone);
            const subtitle = f.name ? formatPhone(f.phone) : 'Še ni registriran';
            const owes = bal !== undefined && bal < 0;
            return (
              <Card key={f.phone} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px' }}>
                <button
                  onClick={() => setSheet({ mode: 'edit', friend: f })}
                  style={{ display: 'flex', alignItems: 'center', gap: 13, flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                >
                  <Avatar name={f.name ?? f.phone} id={f.phone} size={44} {...avatarSrcProp(f.avatarUrl)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: '600 16px/1.2 Rubik', color: 'var(--text)' }}>{title}</div>
                    <div style={{ font: '400 13px/1.3 Rubik', color: 'var(--text-sec)' }}>{subtitle}</div>
                  </div>
                </button>
                {bal !== undefined && bal !== 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, flexShrink: 0 }}>
                    <div style={{ font: '600 15px/1 Rubik', color: bal > 0 ? 'var(--pos)' : 'var(--neg)' }}>{signedEur(bal)}</div>
                    {owes ? (
                      <Button
                        variant="pay"
                        onClick={() => flik.open({ toName: f.name ?? formatPhone(f.phone), toPhone: f.phone, amountCents: -bal, reason: 'Poravnava (SplitFlik)', ...(f.avatarUrl ? { avatarUrl: f.avatarUrl } : {}) })}
                      >
                        Plačaj
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {pendingOut.length > 0 ? (
        <div style={{ marginTop: 22 }}>
          <div style={{ font: '600 13px/1 Rubik', color: 'var(--text-sec)', marginBottom: 10 }}>Poslane prošnje</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingOut.map((r) => (
              <Card key={r.toPhone} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px', opacity: 0.8 }}>
                <Avatar name={formatPhone(r.toPhone)} id={r.toPhone} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 16px/1.2 Rubik', color: 'var(--text)' }}>{formatPhone(r.toPhone)}</div>
                  <div style={{ font: '400 13px/1.3 Rubik', color: 'var(--text-sec)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IconClock size={13} color="var(--pend)" strokeWidth={2} /> Čaka na potrditev
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          onClick={() => setSheet({ mode: 'add' })}
          aria-label="Dodaj prijatelja"
          style={{ width: 52, height: 52, borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 28, fontWeight: 300, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(18,82,179,0.3)' }}
        >
          +
        </button>
      </div>

      {sheet ? <FriendSheet sheet={sheet} sender={sender} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function FriendSheet({
  sheet,
  sender,
  onClose,
}: {
  sheet: { mode: 'add' } | { mode: 'edit'; friend: Friend };
  sender: Sender;
  onClose: () => void;
}) {
  const userId = sender.userId;
  const existing = sheet.mode === 'edit' ? sheet.friend : null;
  const [phone, setPhone] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const inviteLink = typeof location !== 'undefined' ? location.origin + location.pathname : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      store.toast('Povezava kopirana');
    } catch {
      store.toast('Kopiranje ni uspelo');
    }
  };

  const add = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) return store.toast('Vnesi veljavno telefonsko številko.');
    if (normalized === sender.phone) return store.toast('To je tvoja številka.');
    const ok = await sendRequest(sender, normalized);
    if (ok) store.toast('Prošnja za prijateljstvo poslana');
    onClose();
  };

  const remove = async () => {
    if (!existing) return;
    await removeFriend(userId, existing.phone);
    store.toast('Prijatelj odstranjen');
    onClose();
  };

  if (!existing) {
    return (
      <BottomSheet title="Dodaj prijatelja" onClose={onClose}>
        <div style={{ font: '400 13px/1.5 Rubik', color: 'var(--text-sec)', marginBottom: 16 }}>
          Vpiši telefonsko številko — poslali mu bomo prošnjo za prijateljstvo, ki jo potrdi v
          svojih obvestilih. Brez QR kode.
        </div>
        <FieldLabel>Telefonska številka</FieldLabel>
        <TextField
          placeholder="031 123 456"
          inputMode="tel"
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          style={{ marginBottom: 18 }}
        />
        <Button variant="primary" full onClick={() => void add()} style={{ marginBottom: 14 }}>
          Pošlji prošnjo
        </Button>
        <div style={{ font: '500 13px/1 Rubik', color: 'var(--text-sec)', marginBottom: 8 }}>
          Ali povabi prijatelje s povezavo
        </div>
        <Button variant="secondary" full onClick={copyLink}>
          <IconLink size={16} color="var(--link)" strokeWidth={2} /> Kopiraj povezavo za povabilo
        </Button>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title="Prijatelj" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <Avatar name={existing.name ?? existing.phone} id={existing.phone} size={72} {...avatarSrcProp(existing.avatarUrl)} />
        <div style={{ font: '600 18px/1.2 Rubik', color: 'var(--text)' }}>
          {existing.name ?? 'Še ni registriran'}
        </div>
        <div style={{ font: '400 14px/1.3 Rubik', color: 'var(--text-sec)' }}>{formatPhone(existing.phone)}</div>
      </div>
      <div style={{ font: '400 12px/1.4 Rubik', color: 'var(--text-sec)', marginBottom: 18, textAlign: 'center' }}>
        Imena in telefonske številke prijatelja ni mogoče spreminjati — ime določi vsak zase ob
        registraciji.
      </div>
      <button
        onClick={() => setConfirmRemove(true)}
        style={{ width: '100%', background: 'none', border: 'none', color: 'var(--neg)', font: '600 14px/1 Rubik', cursor: 'pointer', padding: 8 }}
      >
        Odstrani prijatelja
      </button>
      {confirmRemove ? (
        <ConfirmDialog
          title="Odstrani prijatelja?"
          message={`${existing.name ?? formatPhone(existing.phone)} bo odstranjen iz tvojega seznama prijateljev.`}
          confirmLabel="Odstrani"
          danger
          onConfirm={() => void remove()}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </BottomSheet>
  );
}
