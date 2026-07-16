// Prijatelji — your user-level friend roster (independent of any group). Add a
// friend by phone number, in-app (no SMS): if they're registered, their profile
// picture + name come back automatically. A friend's phone can never be changed
// (feature 2); you rename or remove them. For friends who are in the currently
// active group, their balance + Flik "Plačaj" is shown too.
import { useEffect, useState } from 'react';
import type { Friend } from '../../types';
import { friendBalances } from '../data/derive';
import { addFriend, loadFriends, removeFriend, renameFriend, useFriends } from '../data/friends';
import { avatarSrcProp } from '../data/people';
import { store, useSession, useStore } from '../data/store';
import { formatPhone, normalizePhone, signedEur } from '../format';
import { useFlik } from '../ui/FlikSheet';
import { PAGE_PADDING } from '../ui/AppShell';
import { Avatar, BottomSheet, Button, Card, FieldLabel, TextField } from '../ui/kit';
import { IconLink, IconSearch } from '../ui/icons';

type SheetState = { mode: 'add' } | { mode: 'edit'; friend: Friend } | null;

export function Friends() {
  const state = useStore();
  const session = useSession();
  const meId = session?.personId ?? '';
  const userId = typeof state.authUserId === 'string' ? state.authUserId : '';
  const flik = useFlik();
  const friends = useFriends();
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<SheetState>(null);

  useEffect(() => {
    if (userId) void loadFriends(userId);
  }, [userId]);

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
                        onClick={() => flik.open({ toName: f.name ?? formatPhone(f.phone), toPhone: f.phone, amountCents: -bal })}
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          onClick={() => setSheet({ mode: 'add' })}
          aria-label="Dodaj prijatelja"
          style={{ width: 52, height: 52, borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 28, fontWeight: 300, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(18,82,179,0.3)' }}
        >
          +
        </button>
      </div>

      {sheet ? <FriendSheet sheet={sheet} userId={userId} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function FriendSheet({
  sheet,
  userId,
  onClose,
}: {
  sheet: { mode: 'add' } | { mode: 'edit'; friend: Friend };
  userId: string;
  onClose: () => void;
}) {
  const existing = sheet.mode === 'edit' ? sheet.friend : null;
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [name, setName] = useState(existing?.name ?? '');

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
    const friend = await addFriend(userId, normalized);
    if (friend) store.toast(friend.name ? `Dodan ${friend.name}` : 'Prijatelj dodan');
    onClose();
  };

  const save = async () => {
    if (!existing) return;
    if (!name.trim()) return store.toast('Vnesi ime.');
    await renameFriend(userId, existing.phone, name.trim());
    store.toast('Prijatelj posodobljen');
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
          Prijatelja dodaš z njegovo telefonsko številko. Če je registriran, se samodejno prikažeta
          njegova slika in ime.
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
          Dodaj prijatelja
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
    <BottomSheet title="Uredi prijatelja" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Avatar name={name || existing.phone} id={existing.phone} size={72} {...avatarSrcProp(existing.avatarUrl)} />
      </div>
      <FieldLabel>Ime</FieldLabel>
      <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Ime prijatelja" style={{ marginBottom: 14 }} />
      <FieldLabel>Telefon</FieldLabel>
      <TextField
        value={formatPhone(existing.phone)}
        readOnly
        disabled
        style={{ marginBottom: 6, color: 'var(--text-sec)', background: 'var(--surface3)' }}
      />
      <div style={{ font: '400 12px/1.4 Rubik', color: 'var(--text-sec)', marginBottom: 18 }}>
        Telefonske številke prijatelja ni mogoče spremeniti.
      </div>
      <Button variant="primary" full onClick={() => void save()} style={{ marginBottom: 10 }}>
        Shrani
      </Button>
      <button onClick={() => void remove()} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--neg)', font: '600 14px/1 Rubik', cursor: 'pointer', padding: 8 }}>
        Odstrani prijatelja
      </button>
    </BottomSheet>
  );
}
